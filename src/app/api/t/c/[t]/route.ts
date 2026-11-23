import { and, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { approvalItems } from "@/db/schema";
import { readTrackToken, safeDestination } from "@/server/outbound/tracking";

/** A link in a sent email: records the click, then goes to the page (our own site only). */
export async function GET(req: Request, { params }: { params: Promise<{ t: string }> }) {
  const raw = (await params).t;
  const q = new URL(req.url).searchParams;
  // Elsewhere only with the signature made for this email and this exact link (0031).
  const dest = safeDestination(q.get("u"), raw, q.get("s")) ?? "https://www.ozirealty.com.au/";
  const tok = readTrackToken(raw);
  if (tok) {
    await withTenant(tok.tenantId, (tx) =>
      tx
        .update(approvalItems)
        .set({
          clickCount: sql`${approvalItems.clickCount} + 1`,
          clickedAt: sql`coalesce(${approvalItems.clickedAt}, now())`,
          // A click means it was opened, whatever the image did.
          openedAt: sql`coalesce(${approvalItems.openedAt}, now())`,
          openCount: sql`greatest(${approvalItems.openCount}, 1)`,
        })
        .where(
          and(
            eq(approvalItems.id, tok.itemId),
            eq(approvalItems.status, "sent"),
            // Machine fetches (mail scanners, the sender's own Sent copy) land within seconds
            // of sending. A person rarely opens that fast, so those do not count (2026-11-20).
            sql`${approvalItems.sentAt} < now() - interval '90 seconds'`,
          ),
        ),
    ).catch(() => null);
  }
  return Response.redirect(dest, 302);
}
