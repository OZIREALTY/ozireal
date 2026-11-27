import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { contacts, gmailContactItems, gmailContactRuns } from "@/db/schema";
import { normaliseEmail, toE164 } from "@/lib/normalise";
import { getSecret } from "@/server/secrets";
import { listContacts, type GoogleContact } from "./google";

/**
 * The Gmail contacts check (owner-approved preview, 2026-11-27).
 *
 * Google Contacts against the CRM, matched on normalised email and phone only (CLAUDE.md
 * §4: never merge on a name). Three findings for the owner to review:
 *   new:       no email or phone match, and no CRM contact of the same name;
 *   duplicate: no email or phone match, but a CRM contact with the same name;
 *   extra:     matched, and Gmail has an email or phone the CRM record lacks.
 * For "new" people, Haiku suggests a role from the last few emails with them (read-only
 * IMAP, owner-approved for this purpose). Nothing here writes to a contact.
 */
const GMAIL_USER = process.env.GMAIL_USER ?? "admin@ozirealty.com.au";
const AI_PER_RUN = 60;

const roleOut = z.object({
  role: z.enum(["buyer", "vendor", "landlord", "tenant", "investor", "referrer", "business_vendor", "developer", "agent", "not_client", "unknown"]),
  reason: z.string().trim().max(240).catch(""),
});

const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

async function step(tenantId: string, runId: string, text: string) {
  await withTenant(tenantId, (tx) => tx.update(gmailContactRuns).set({ step: text }).where(eq(gmailContactRuns.id, runId)));
}

/** Starts a run unless one is already going (a stuck run frees itself after 20 minutes). */
export async function startRun(tenantId: string, trigger: "auto" | "manual"): Promise<string | null> {
  return withTenant(tenantId, async (tx) => {
    const [busy] = await tx
      .select({ id: gmailContactRuns.id })
      .from(gmailContactRuns)
      .where(and(eq(gmailContactRuns.status, "running"), sql`${gmailContactRuns.startedAt} > now() - interval '20 minutes'`))
      .limit(1);
    if (busy) return null;
    await tx.update(gmailContactRuns).set({ status: "failed", error: "Stopped: took too long.", finishedAt: new Date() }).where(eq(gmailContactRuns.status, "running"));
    const [r] = await tx.insert(gmailContactRuns).values({ tenantId, trigger, step: "Starting…" }).returning({ id: gmailContactRuns.id });
    return r.id;
  });
}

/** The fortnightly schedule fires weekly; this skips the off week. */
export async function dueForAuto(tenantId: string) {
  const [last] = await withTenant(tenantId, (tx) =>
    tx
      .select({ at: gmailContactRuns.startedAt })
      .from(gmailContactRuns)
      .where(and(eq(gmailContactRuns.trigger, "auto"), eq(gmailContactRuns.status, "done")))
      .orderBy(desc(gmailContactRuns.startedAt))
      .limit(1),
  );
  return !last || Date.now() - last.at.getTime() > 12 * 864e5;
}

export async function runCheck(tenantId: string, runId: string) {
  try {
    await step(tenantId, runId, "Reading Google Contacts…");
    const google = await listContacts(tenantId);

    await step(tenantId, runId, `Comparing with the CRM (${google.length} in Gmail)…`);
    const crm = await withTenant(tenantId, (tx) =>
      tx
        .select({
          id: contacts.id,
          first: contacts.firstName,
          last: contacts.lastName,
          email: contacts.emailNormalised,
          email2: contacts.secondaryEmail,
          phone: contacts.phoneE164,
          phone2: contacts.secondaryPhone,
        })
        .from(contacts)
        .where(and(isNull(contacts.tombstonedAt), isNull(contacts.mergedIntoId))),
    );
    const byEmail = new Map<string, string>();
    const byPhone = new Map<string, string>();
    const byName = new Map<string, string>();
    const have = new Map<string, { emails: Set<string>; phones: Set<string> }>();
    for (const c of crm) {
      const emails = [c.email, normaliseEmail(c.email2)].filter((x): x is string => !!x);
      const phones = [c.phone, toE164(c.phone2)].filter((x): x is string => !!x);
      emails.forEach((e) => byEmail.set(e, c.id));
      phones.forEach((p) => byPhone.set(p, c.id));
      const nk = nameKey(`${c.first} ${c.last}`);
      if (nk.includes(" ")) byName.set(nk, c.id);
      have.set(c.id, { emails: new Set(emails), phones: new Set(phones) });
    }

    // Gmail can hold the same person twice: merge entries that share an email or phone.
    const seen = new Map<string, GoogleContact>();
    const people: GoogleContact[] = [];
    for (const g of google) {
      const keys = [...g.emails.map((e) => `e:${normaliseEmail(e)}`), ...g.phones.map((p) => `p:${toE164(p)}`)].filter((k) => !k.endsWith(":null"));
      const twin = keys.map((k) => seen.get(k)).find(Boolean);
      if (twin) {
        twin.emails = [...new Set([...twin.emails, ...g.emails])];
        twin.phones = [...new Set([...twin.phones, ...g.phones])];
        continue;
      }
      people.push(g);
      keys.forEach((k) => seen.set(k, g));
    }

    const found: { g: GoogleContact; kind: "new" | "duplicate" | "extra"; crmId: string | null; extra?: { emails: string[]; phones: string[] } }[] = [];
    for (const g of people) {
      const ne = g.emails.map((e) => ({ raw: e, n: normaliseEmail(e) })).filter((x) => x.n);
      const np = g.phones.map((p) => ({ raw: p, n: toE164(p) })).filter((x) => x.n);
      const match = ne.map((e) => byEmail.get(e.n!)).find(Boolean) ?? np.map((p) => byPhone.get(p.n!)).find(Boolean);
      if (match) {
        const h = have.get(match)!;
        const emails = ne.filter((e) => !h.emails.has(e.n!)).map((e) => e.raw);
        const phones = np.filter((p) => !h.phones.has(p.n!)).map((p) => p.raw);
        if (emails.length || phones.length) found.push({ g, kind: "extra", crmId: match, extra: { emails, phones } });
        continue;
      }
      const same = byName.get(nameKey(g.name));
      found.push(same ? { g, kind: "duplicate", crmId: same } : { g, kind: "new", crmId: null });
    }

    // Save: new findings open; ones already decided (added / skipped / done) stay decided.
    await withTenant(tenantId, async (tx) => {
      for (const f of found) {
        await tx
          .insert(gmailContactItems)
          .values({
            tenantId,
            resourceName: f.g.resourceName,
            etag: f.g.etag,
            kind: f.kind,
            name: f.g.name.slice(0, 200),
            emails: f.g.emails.slice(0, 5),
            phones: f.g.phones.slice(0, 5),
            crmContactId: f.crmId,
            extra: f.extra ?? null,
          })
          .onConflictDoUpdate({
            target: [gmailContactItems.tenantId, gmailContactItems.resourceName, gmailContactItems.kind],
            set: {
              etag: f.g.etag,
              name: f.g.name.slice(0, 200),
              emails: f.g.emails.slice(0, 5),
              phones: f.g.phones.slice(0, 5),
              crmContactId: f.crmId,
              extra: f.extra ?? null,
              lastSeen: new Date(),
            },
          });
      }
      // Anything open that this run no longer found is settled (added elsewhere, or deleted in Gmail).
      const keep = found.map((f) => `${f.g.resourceName}|${f.kind}`);
      const open = await tx.select({ id: gmailContactItems.id, rn: gmailContactItems.resourceName, kind: gmailContactItems.kind }).from(gmailContactItems).where(eq(gmailContactItems.status, "open"));
      for (const o of open) if (!keep.includes(`${o.rn}|${o.kind}`)) await tx.update(gmailContactItems).set({ status: "done" }).where(eq(gmailContactItems.id, o.id));
    });

    // Roles for new people who have none yet, from their recent emails.
    const needRole = await withTenant(tenantId, (tx) =>
      tx
        .select({ id: gmailContactItems.id, name: gmailContactItems.name, emails: gmailContactItems.emails })
        .from(gmailContactItems)
        .where(and(eq(gmailContactItems.kind, "new"), eq(gmailContactItems.status, "open"), isNull(gmailContactItems.suggestedRole)))
        .limit(AI_PER_RUN),
    );
    if (needRole.length) {
      await step(tenantId, runId, `Suggesting roles for ${needRole.length} new ${needRole.length === 1 ? "person" : "people"}…`);
      const mail = await mailFor(tenantId, needRole.flatMap((n) => n.emails)).catch(() => new Map<string, Msg[]>());
      const { runTask } = await import("@/server/ai/run-task");
      const { loadPrompt } = await import("@/server/ai/prompts");
      const prompt = loadPrompt("contact-role.v1");
      for (const n of needRole) {
        const messages = n.emails.flatMap((e) => mail.get(e.toLowerCase()) ?? []).slice(0, 5);
        try {
          const { data } = await runTask(roleOut, {
            task: "gmail-contact-role",
            model: "haiku",
            output: "structured",
            tenantId,
            entity: { type: "gmail_contact", id: n.id },
            promptVersion: prompt.version,
            system: [{ text: prompt.text }],
            maxTokens: 300,
            messages: [{ role: "user", content: JSON.stringify({ name: n.name, emails: n.emails, messages }) }],
          });
          await withTenant(tenantId, (tx) =>
            tx.update(gmailContactItems).set({ suggestedRole: data.role, roleReason: data.reason || null }).where(eq(gmailContactItems.id, n.id)),
          );
        } catch {
          // One bad answer must not stop the run; this person is retried next time.
        }
      }
    }

    const totals = {
      gmail: people.length,
      crm: crm.length,
      new: found.filter((f) => f.kind === "new").length,
      duplicate: found.filter((f) => f.kind === "duplicate").length,
      extra: found.filter((f) => f.kind === "extra").length,
    };
    await withTenant(tenantId, (tx) =>
      tx.update(gmailContactRuns).set({ status: "done", step: null, totals, finishedAt: new Date() }).where(eq(gmailContactRuns.id, runId)),
    );
    return totals;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "The check failed.";
    await withTenant(tenantId, (tx) =>
      tx.update(gmailContactRuns).set({ status: "failed", step: null, error: msg.slice(0, 300), finishedAt: new Date() }).where(eq(gmailContactRuns.id, runId)),
    );
    throw e;
  }
}

type Msg = { date: string; direction: "in" | "out"; subject: string; text: string };

/** The last few emails with each address, from All Mail, read-only. */
async function mailFor(tenantId: string, addresses: string[]): Promise<Map<string, Msg[]>> {
  const out = new Map<string, Msg[]>();
  const pass = await getSecret(tenantId, "GMAIL_APP_PASSWORD");
  if (!pass || !addresses.length) return out;
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: GMAIL_USER, pass }, logger: false });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("[Gmail]/All Mail", { readonly: true });
    try {
      for (const raw of [...new Set(addresses.map((a) => a.toLowerCase()))]) {
        const uids = ((await client.search({ or: [{ from: raw }, { to: raw }] }, { uid: true })) || []) as number[];
        const last = uids.slice(-3);
        const msgs: Msg[] = [];
        for (const uid of last) {
          const m = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!m || !m.source) continue;
          const p = await simpleParser(m.source);
          const from = (p.from?.value?.[0]?.address ?? "").toLowerCase();
          msgs.push({
            date: p.date ? p.date.toISOString().slice(0, 10) : "",
            direction: from === raw ? "in" : "out",
            subject: (p.subject ?? "").slice(0, 150),
            text: (p.text ?? "").replace(/\s+/g, " ").slice(0, 700),
          });
        }
        out.set(raw, msgs);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => null);
  }
  return out;
}
