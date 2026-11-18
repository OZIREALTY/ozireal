import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { withTenant } from "@/db";
import { approvalItems, tenants } from "@/db/schema";
import { emailPropertyFor, propertyEmailHtml } from "@/server/outbound/property-email";

/**
 * The full email a draft will send, rendered exactly as the client gets it (2026-11-18):
 * personal text, project card, signature, unsubscribe line. Signed-in staff only; shown
 * in a frame on the review screen.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return new Response("Sign in first.", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const row = await withTenant(tenantId, async (tx) => {
    const [item] = await tx
      .select({ body: approvalItems.draftBody, listingId: approvalItems.listingId, card: approvalItems.card })
      .from(approvalItems)
      .where(eq(approvalItems.id, id))
      .limit(1);
    const [t] = await tx.select({ name: tenants.name, licence: tenants.licenceNumber }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return item && t ? { item, t } : null;
  });
  if (!row) return new Response("Not found", { status: 404 });

  const property = row.item.listingId ? await emailPropertyFor(tenantId, row.item.listingId) : null;
  const html = propertyEmailHtml({
    body: row.item.body,
    property,
    card: row.item.card,
    unsubscribeUrl: "https://www.ozirealty.com.au/unsubscribe",
    agencyLine: row.t.licence ? `${row.t.name} · ${row.t.licence}` : row.t.name,
  });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-frame-options": "SAMEORIGIN" },
  });
}
