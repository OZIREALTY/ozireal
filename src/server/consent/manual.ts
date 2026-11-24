import { eq } from "drizzle-orm";
import { consents, contacts } from "@/db/schema";
import type { Tx } from "@/db";

/**
 * Consent given outside a web form, recorded by a person in the CRM (§4, Spam Act).
 * Shared by "Record consent" on a contact and the consent section of "Add contact"
 * (owner, 2026-11-23), so both write the same provenance: how they agreed, who
 * recorded it, when, and the wording of what they agreed to.
 *
 * Not a Server Action file: a "use server" module may only export actions.
 */
export const CONSENT_METHODS = {
  phone_call: "phone call",
  email: "email",
  sms: "SMS",
  in_person: "in person",
  in_writing: "in writing",
} as const;
export type ConsentMethod = keyof typeof CONSENT_METHODS;

/**
 * Standing consent (owner, 2026-11-24): the agency obtains consent from every contact
 * before entering them, so each contact is recorded as agreeing to email, SMS and
 * calls on creation, with this statement as the provenance. Asking per contact was
 * removed at the owner's request. The owner confirmed the wording.
 *
 * Never overrides: a channel that already has ANY record (a form's consent, an
 * unsubscribe, a STOP) is left as it is, so an opt-out always stays in force. A contact
 * marked do-not-contact gets nothing.
 */
export const STANDING_CONSENT_WORDING =
  "Consent obtained by the agency before entry into the CRM — confirmed by the owner, 24 Nov 2026";
export const STANDING_CONSENT_SOURCE = "Agency standing consent (owner-confirmed 24 Nov 2026)";

export async function grantStandingConsent(tx: Tx, o: { tenantId: string; contactId: string }) {
  const [c] = await tx
    .select({ doNotContact: contacts.doNotContact })
    .from(contacts)
    .where(eq(contacts.id, o.contactId))
    .limit(1);
  if (!c || c.doNotContact) return 0;
  const existing = await tx
    .select({ channel: consents.channel })
    .from(consents)
    .where(eq(consents.contactId, o.contactId));
  const has = new Set(existing.map((e) => e.channel));
  let added = 0;
  for (const channel of ["email", "sms", "phone"] as const) {
    if (has.has(channel)) continue;
    await tx.insert(consents).values({
      tenantId: o.tenantId,
      contactId: o.contactId,
      channel,
      status: "granted",
      sourceForm: STANDING_CONSENT_SOURCE,
      wordingShown: STANDING_CONSENT_WORDING,
      ipAddress: null,
      occurredAt: new Date(),
    });
    added++;
  }
  return added;
}

export async function insertManualConsent(
  tx: Tx,
  o: {
    tenantId: string;
    contactId: string;
    channel: "email" | "sms" | "phone";
    status: "granted" | "revoked";
    method: ConsentMethod;
    recordedBy: string;
    wording: string;
    occurredAt: Date;
  },
) {
  const [row] = await tx
    .insert(consents)
    .values({
      tenantId: o.tenantId,
      contactId: o.contactId,
      channel: o.channel,
      status: o.status,
      sourceForm: `Manual: ${CONSENT_METHODS[o.method]}, recorded by ${o.recordedBy}`,
      wordingShown: o.wording,
      ipAddress: null,
      occurredAt: o.occurredAt,
    })
    .returning({ id: consents.id });
  return row;
}
