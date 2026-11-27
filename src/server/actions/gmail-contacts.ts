"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { defineAction, ActionError, normaliseEmail, toE164 } from "./action";
import { contacts, contactRoles, gmailContactItems } from "@/db/schema";
import { grantStandingConsent } from "@/server/consent/manual";

/**
 * The owner's decisions on the Gmail contacts check (owner-approved, 2026-11-27).
 * Every write here is a click. People added from Gmail get the agency's standing
 * consent, like every other channel (owner's decision, 2026-11-27, replacing "no consent").
 */
const ROLES = ["buyer", "vendor", "landlord", "tenant", "referrer", "investor", "developer", "business_vendor", "agent"] as const;

/** Refresh from Gmail now. Refused politely while a run is going. */
export const refreshGmailContacts = defineAction({
  input: z.object({}),
  async handler(_input, ctx) {
    const { getSecret } = await import("@/server/secrets");
    if (!(await getSecret(ctx.tenantId, "GOOGLE_CONTACTS_REFRESH_TOKEN"))) throw new ActionError("Connect Google Contacts first.");
    const { startRun } = await import("@/server/gcontacts/check");
    const run = await startRun(ctx.tenantId, "manual");
    if (!run) throw new ActionError("A check is already running. It will finish in a moment.");
    const { enqueue } = await import("@/server/jobs/queues");
    await enqueue("GmailContactsCheck", { tenantId: ctx.tenantId, entityId: run });
    return { runId: run };
  },
});

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0].slice(0, 80), last: "" };
  return { first: parts.slice(0, -1).join(" ").slice(0, 80), last: parts[parts.length - 1].slice(0, 80) };
}

/** Add the ticked people as new contacts, each with the role chosen. */
export const addGmailContacts = defineAction({
  input: z.object({
    items: z
      .array(z.object({ id: z.string().uuid(), role: z.union([z.enum(ROLES), z.literal("")]) }))
      .min(1)
      .max(200),
  }),
  async handler(input, ctx) {
    const rows = await ctx.tx
      .select()
      .from(gmailContactItems)
      .where(and(inArray(gmailContactItems.id, input.items.map((i) => i.id)), eq(gmailContactItems.status, "open")));
    let added = 0;
    for (const r of rows) {
      const { first, last } = splitName(r.name);
      const email = r.emails[0] ?? null;
      const phone = r.phones[0] ?? null;
      const [c] = await ctx.tx
        .insert(contacts)
        .values({
          tenantId: ctx.tenantId,
          firstName: first,
          lastName: last,
          emailRaw: email,
          emailNormalised: normaliseEmail(email),
          secondaryEmail: r.emails[1] ?? null,
          phoneRaw: phone,
          phoneE164: toE164(phone),
          secondaryPhone: r.phones[1] ?? null,
          sourceChannel: "manual",
          ownerUserId: ctx.userId,
        })
        .returning({ id: contacts.id });
      const role = input.items.find((i) => i.id === r.id)?.role;
      if (role) await ctx.tx.insert(contactRoles).values({ tenantId: ctx.tenantId, contactId: c.id, role }).onConflictDoNothing();
      // Standing consent, as for every other way a contact enters the CRM (owner, 2026-11-27).
      await grantStandingConsent(ctx.tx, { tenantId: ctx.tenantId, contactId: c.id });
      await ctx.tx.update(gmailContactItems).set({ status: "added", crmContactId: c.id }).where(eq(gmailContactItems.id, r.id));
      added++;
    }
    await ctx.audit({ kind: "edit", action: "Added contacts from Gmail", target: `${added} contact${added === 1 ? "" : "s"}`, entityType: "contact" });
    revalidatePath("/contacts");
    revalidatePath("/contacts/gmail-check");
    revalidatePath("/dashboard");
    return { added };
  },
});

/** Not wanted in the CRM; it will not be shown again. */
export const skipGmailItems = defineAction({
  input: z.object({ ids: z.array(z.string().uuid()).min(1).max(200), undo: z.boolean().default(false) }),
  async handler(input, ctx) {
    await ctx.tx
      .update(gmailContactItems)
      .set({ status: input.undo ? "open" : "skipped" })
      .where(inArray(gmailContactItems.id, input.ids));
    revalidatePath("/contacts/gmail-check");
    revalidatePath("/dashboard");
    return { ok: true };
  },
});

/**
 * Copy Gmail's extra email or phone onto the CRM record ("extra", or a duplicate the
 * owner says is the same person). Fills empty slots only; never overwrites.
 */
export const applyGmailDetails = defineAction({
  input: z.object({ id: z.string().uuid() }),
  async handler(input, ctx) {
    const [it] = await ctx.tx.select().from(gmailContactItems).where(eq(gmailContactItems.id, input.id)).limit(1);
    if (!it || it.status !== "open" || !it.crmContactId) throw new ActionError("That item was already handled.");
    const [c] = await ctx.tx
      .select({ email: contacts.emailRaw, email2: contacts.secondaryEmail, phone: contacts.phoneRaw, phone2: contacts.secondaryPhone, en: contacts.emailNormalised, pe: contacts.phoneE164 })
      .from(contacts)
      .where(eq(contacts.id, it.crmContactId))
      .limit(1);
    if (!c) throw new ActionError("That contact no longer exists.");
    const emails = (it.kind === "extra" ? it.extra?.emails : it.emails) ?? [];
    const phones = (it.kind === "extra" ? it.extra?.phones : it.phones) ?? [];
    const newEmail = emails.find((e) => normaliseEmail(e) !== c.en && normaliseEmail(e) !== normaliseEmail(c.email2));
    const newPhone = phones.find((p) => toE164(p) !== c.pe && toE164(p) !== toE164(c.phone2));
    const set: Partial<typeof contacts.$inferInsert> = {};
    const kept: string[] = [];
    if (newEmail) {
      if (!c.email) Object.assign(set, { emailRaw: newEmail, emailNormalised: normaliseEmail(newEmail) });
      else if (!c.email2) set.secondaryEmail = newEmail;
      else kept.push(newEmail);
    }
    if (newPhone) {
      if (!c.phone) Object.assign(set, { phoneRaw: newPhone, phoneE164: toE164(newPhone) });
      else if (!c.phone2) set.secondaryPhone = newPhone;
      else kept.push(newPhone);
    }
    if (Object.keys(set).length) await ctx.tx.update(contacts).set(set).where(eq(contacts.id, it.crmContactId));
    await ctx.tx.update(gmailContactItems).set({ status: "done" }).where(eq(gmailContactItems.id, it.id));
    await ctx.audit({ kind: "edit", action: "Added details from Gmail", target: it.name, entityType: "contact", entityId: it.crmContactId });
    revalidatePath("/contacts/gmail-check");
    revalidatePath(`/contacts/${it.crmContactId}`);
    return { applied: Object.keys(set).length > 0, notRoomFor: kept };
  },
});
