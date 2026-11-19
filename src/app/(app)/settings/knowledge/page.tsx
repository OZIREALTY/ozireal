import { desc } from "drizzle-orm";
import { query } from "@/db";
import { knowledgeDocs, tenants } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { KnowledgeShelves } from "@/components/knowledge/shelves";

export const metadata = { title: "AI training" };

/**
 * Settings → AI training (2026-11-19, owner: "for the AI training"). Instructions and agency knowledge ride on every AI call; the legal
 * library is searched and cited.
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
        title="AI training"
        subtitle="Teach the AI how to work for you. Instructions and agency knowledge go into every AI feature: the assistant, email drafts, matching and content."
      />
      <KnowledgeShelves docs={docs} jurisdiction={jurisdiction} initialShelf={shelf === "legal" || shelf === "office" ? shelf : "rules"} />
    </>
  );
}
