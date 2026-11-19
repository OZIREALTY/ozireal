import { desc } from "drizzle-orm";
import { query } from "@/db";
import { knowledgeDocs, tenants } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { KnowledgeShelves } from "@/components/knowledge/shelves";

export const metadata = { title: "Knowledge base" };

/**
 * Settings → Knowledge base (2026-11-19). The office's own documents and the legal
 * library on one page; the assistant answers from both and names its source.
 */
export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ shelf?: string }> }) {
  const { shelf } = await searchParams;
  const { docs, jurisdiction } = await query(async (tx) => {
    const [t] = await tx.select({ j: tenants.jurisdiction }).from(tenants).limit(1);
    const rows = await tx
      .select({
        id: knowledgeDocs.id,
        shelf: knowledgeDocs.shelf,
        title: knowledgeDocs.title,
        source: knowledgeDocs.source,
        sourceRef: knowledgeDocs.sourceRef,
        jurisdiction: knowledgeDocs.jurisdiction,
        instrument: knowledgeDocs.instrument,
        versionDate: knowledgeDocs.versionDate,
        chunks: knowledgeDocs.chunks,
        embedded: knowledgeDocs.embedded,
        createdAt: knowledgeDocs.createdAt,
      })
      .from(knowledgeDocs)
      .orderBy(desc(knowledgeDocs.createdAt));
    return { docs: rows, jurisdiction: t?.j ?? "" };
  });

  return (
    <>
      <PageHeader
        title="Knowledge base"
        subtitle="Your office documents and the legal library. Ask AI on any page answers from these and names the document or section it used."
      />
      <KnowledgeShelves docs={docs} jurisdiction={jurisdiction} initialShelf={shelf === "legal" ? "legal" : "office"} />
    </>
  );
}
