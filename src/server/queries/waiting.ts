import { and, asc, eq, inArray } from "drizzle-orm";
import { query } from "@/db";
import { approvalItems } from "@/db/schema";

/**
 * Approval happens inside the process (owner, 2026-11-20): an email batch on its Review
 * and send screen, a single message on the person's contact page. These say where.
 */
export function waitingHref(i: { campaignId: string | null; contactId: string | null }) {
  if (i.campaignId) return `/campaigns/${i.campaignId}/review`;
  if (i.contactId) return `/contacts/${i.contactId}#waiting`;
  return "/campaigns";
}

/** Where to go for the oldest message waiting for an OK (Today's banner). */
export async function firstWaitingHref() {
  return query(async (tx) => {
    const [i] = await tx
      .select({ campaignId: approvalItems.campaignId, contactId: approvalItems.contactId })
      .from(approvalItems)
      .where(eq(approvalItems.status, "pending"))
      .orderBy(asc(approvalItems.createdAt))
      .limit(1);
    return i ? waitingHref(i) : null;
  });
}

/** One person's messages waiting for an OK, or stopped at the consent check. */
export async function waitingFor(contactId: string) {
  return query((tx) =>
    tx
      .select({
        id: approvalItems.id,
        kind: approvalItems.kind,
        status: approvalItems.status,
        subject: approvalItems.draftSubject,
        body: approvalItems.draftBody,
        campaignId: approvalItems.campaignId,
        blockReason: approvalItems.blockReason,
        reviewNote: approvalItems.reviewNote,
        createdAt: approvalItems.createdAt,
      })
      .from(approvalItems)
      .where(and(eq(approvalItems.contactId, contactId), inArray(approvalItems.status, ["pending", "blocked"])))
      .orderBy(asc(approvalItems.createdAt)),
  );
}
