import { and, eq, gt, isNull } from "drizzle-orm";
import { db, withTenant } from "@/db";
import { approvalItems, contacts, tenants } from "@/db/schema";
import { getSecret } from "@/server/secrets";
import { ingestThrough } from "@/server/intake/pipeline";

/**
 * Replies to sent emails (option A, owner-approved 2026-11-20). Campaign emails go out
 * from the agency's Google mailbox, so replies arrive there. Every few minutes this reads
 * the INBOX headers of the last fourteen days and picks ONLY messages answering an email
 * the CRM sent (In-Reply-To / References carrying our Message-ID). Everything else in the
 * mailbox is never fetched. A reply goes through the email channel adapter like any other
 * inbound email (§5), so it lands on the contact's interaction log, and the sent email is
 * marked replied.
 */
const GMAIL_USER = process.env.GMAIL_USER ?? "admin@ozirealty.com.au";
const norm = (id: string) => id.trim().replace(/^<|>$/g, "").toLowerCase();

export async function checkReplies() {
  const ts = await db.select({ id: tenants.id }).from(tenants);
  let found = 0;
  for (const t of ts) found += (await checkRepliesFor(t.id)).found;
  return { found };
}

export type ReplyCheck = { at: string; found: number; looked: number; error: string | null };
const statusKey = (tenantId: string) => `ozirealty:replies:${tenantId}`;

/** One tenant, with the outcome kept so the screen can say when it last worked, or why not. */
export async function checkRepliesFor(tenantId: string): Promise<ReplyCheck> {
  const out: ReplyCheck = { at: new Date().toISOString(), found: 0, looked: 0, error: null };
  try {
    const pass = await getSecret(tenantId, "GMAIL_APP_PASSWORD").catch(() => null);
    if (!pass) out.error = "No Gmail app password is saved (Settings → Credentials).";
    else Object.assign(out, await checkTenant(tenantId, pass.replace(/\s+/g, "")));
  } catch (e) {
    const m = e instanceof Error ? `${e.message} ${(e as { responseText?: string }).responseText ?? ""}` : String(e);
    out.error = /AUTHENTICATIONFAILED|Invalid credentials|Authentication failed/i.test(m)
      ? "Gmail refused the login. Make sure IMAP is on (Gmail → Settings → Forwarding and POP/IMAP → Enable IMAP) and the app password in Settings → Credentials is current."
      : /IMAP access is disabled|disabled for your account|Web login required/i.test(m)
        ? "IMAP is switched off for this Gmail account. Turn it on in Gmail → Settings → Forwarding and POP/IMAP, or ask your Google Workspace admin."
        : `Could not read Gmail: ${m.trim().slice(0, 200)}`;
  }
  try {
    const { getConnection } = await import("@/server/jobs/queues");
    await getConnection().set(statusKey(tenantId), JSON.stringify(out));
  } catch {
    /* the status is a convenience; the check itself already ran */
  }
  return out;
}

export async function lastReplyCheck(tenantId: string): Promise<ReplyCheck | null> {
  try {
    const { getConnection } = await import("@/server/jobs/queues");
    const v = await getConnection().get(statusKey(tenantId));
    return v ? (JSON.parse(v) as ReplyCheck) : null;
  } catch {
    return null;
  }
}

async function checkTenant(tenantId: string, pass: string) {
  const since = new Date(Date.now() - 60 * 864e5);
  const sent = await withTenant(tenantId, (tx) =>
    tx
      .select({ id: approvalItems.id, msgId: approvalItems.providerMessageId, sentAt: approvalItems.sentAt, email: contacts.emailRaw })
      .from(approvalItems)
      .innerJoin(contacts, eq(contacts.id, approvalItems.contactId))
      .where(and(eq(approvalItems.kind, "email"), eq(approvalItems.status, "sent"), isNull(approvalItems.repliedAt), gt(approvalItems.sentAt, since))),
  );
  if (!sent.length) return { found: 0, looked: 0 };
  const byMsg = new Map(sent.filter((s) => s.msgId).map((s) => [norm(s.msgId!), s.id]));
  /**
   * Second way to recognise a reply (2026-11-20): mail clients do not always keep the
   * thread headers, and a provider can rewrite the Message-ID. A message FROM a person we
   * emailed, arriving after that email, is their answer. Still only people we emailed.
   */
  const bySender = new Map<string, { id: string; sentAt: Date }>();
  for (const s of sent) {
    const k = s.email?.trim().toLowerCase();
    if (!k || !s.sentAt) continue;
    const cur = bySender.get(k);
    if (!cur || s.sentAt > cur.sentAt) bySender.set(k, { id: s.id, sentAt: s.sentAt });
  }

  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: GMAIL_USER, pass }, logger: false });
  await client.connect();
  const hits: { uid: number; itemId: string }[] = [];
  let looked = 0;
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      for await (const m of client.fetch({ since: new Date(Date.now() - 14 * 864e5) }, { uid: true, envelope: true, headers: ["references"] })) {
        looked++;
        const refs = [m.envelope?.inReplyTo ?? "", ...(m.headers?.toString("utf8").replace(/^references:/i, "").split(/\s+/) ?? [])]
          .filter(Boolean)
          .map(norm);
        let itemId = refs.map((r) => byMsg.get(r)).find(Boolean);
        if (!itemId) {
          const from = m.envelope?.from?.[0]?.address?.toLowerCase();
          const hit = from ? bySender.get(from) : undefined;
          const at = m.envelope?.date ? new Date(m.envelope.date) : null;
          if (hit && at && at > hit.sentAt) itemId = hit.id;
        }
        if (itemId) hits.push({ uid: m.uid, itemId });
      }
      for (const h of hits) {
        const msg = await client.fetchOne(String(h.uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const mime = msg.source.toString("utf8");
        // Mark the reply FIRST: logging it on the contact must never stop it counting.
        const snippet = await replySnippet(mime).catch(() => null);
        await withTenant(tenantId, (tx) =>
          tx
            .update(approvalItems)
            .set({ repliedAt: new Date(), replySnippet: snippet })
            .where(and(eq(approvalItems.id, h.itemId), isNull(approvalItems.repliedAt))),
        );
        await ingestThrough("email", { mime, rawS3Key: null }, tenantId).catch((e) =>
          console.error("[replies] logging the reply on the contact failed:", e instanceof Error ? e.message : e),
        );
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => null);
  }
  return { found: hits.length, looked };
}

/** The new words of a reply: quoted history and signatures cut off. */
async function replySnippet(mime: string) {
  const { simpleParser } = await import("mailparser");
  const mail = await simpleParser(mime);
  const lines: string[] = [];
  for (const l of (mail.text ?? "").split(/\r?\n/)) {
    if (/^\s*>/.test(l) || /^On .+wrote:\s*$/i.test(l.trim()) || /^-{2,}\s*$/.test(l.trim())) break;
    if (l.trim()) lines.push(l.trim());
  }
  return lines.join(" ").slice(0, 280) || null;
}


/**
 * A reply that came to reply+<item>@in.ozirealty.com.au through Amazon SES (option 2,
 * 2026-11-20): count it against that exact email, then pass it on to the agency Gmail.
 * Returns true when the mail was one of these replies.
 */
export async function handleReplyInbox(tenantId: string, destinations: string[], mime: string): Promise<boolean> {
  const { readReplyAddress } = await import("./tracking");
  const itemId = destinations.map(readReplyAddress).find(Boolean);
  if (!itemId) return false;
  const snippet = await replySnippet(mime).catch(() => null);
  await withTenant(tenantId, (tx) =>
    tx
      .update(approvalItems)
      .set({ repliedAt: new Date(), replySnippet: snippet })
      .where(and(eq(approvalItems.id, itemId), isNull(approvalItems.repliedAt))),
  );
  try {
    const { simpleParser } = await import("mailparser");
    const mail = await simpleParser(mime);
    const from = Array.isArray(mail.from) ? mail.from[0] : mail.from;
    const who = from?.value?.[0];
    const { forwardReply } = await import("./notices");
    await forwardReply(tenantId, {
      fromName: who?.name ?? "",
      fromAddress: who?.address ?? "",
      subject: mail.subject ?? "Reply",
      text: mail.text ?? "",
      html: typeof mail.html === "string" ? mail.html : null,
    });
  } catch (e) {
    console.error("[replies] forwarding to Gmail failed:", e instanceof Error ? e.message : e);
  }
  return true;
}
