import { consents } from "@/db/schema";
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
