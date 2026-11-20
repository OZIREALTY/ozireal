import { and, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { approvalItems } from "@/db/schema";
import { readTrackToken } from "@/server/outbound/tracking";

/** The tracking image: records an open (a rough signal) and returns a 1x1 GIF. */
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: Request, { params }: { params: Promise<{ t: string }> }) {
  const tok = readTrackToken((await params).t);
  if (tok) {
    await withTenant(tok.tenantId, (tx) =>
      tx
        .update(approvalItems)
        .set({ openCount: sql`${approvalItems.openCount} + 1`, openedAt: sql`coalesce(${approvalItems.openedAt}, now())` })
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
  return new Response(GIF, {
    headers: { "content-type": "image/gif", "cache-control": "no-store, no-cache, must-revalidate, private" },
  });
}
