import { and, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { approvalItems } from "@/db/schema";
import { readTrackToken, safeDestination } from "@/server/outbound/tracking";

/** A link in a sent email: records the click, then goes to the page (our own site only). */
export async function GET(req: Request, { params }: { params: Promise<{ t: string }> }) {
  const dest = safeDestination(new URL(req.url).searchParams.get("u")) ?? "https://www.ozirealty.com.au/";
  const tok = readTrackToken((await params).t);
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
        .where(and(eq(approvalItems.id, tok.itemId), eq(approvalItems.status, "sent"))),
    ).catch(() => null);
  }
  return Response.redirect(dest, 302);
}
