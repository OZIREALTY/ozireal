import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { siteContent } from "@/db/schema";

/** The New Homes page card a project listing corresponds to, with its position (2026-11-18). */
export type NewHomesCard = { index: number; kind: string | null; heading: string; headingEm: string | null; highlights: string[]; bullets: string[]; specs: Record<string, string> | null; priceMin: number | null };

export async function newHomesCard(
  tx: Tx,
  l: { projectName: string | null; suburb: string | null; priceMin: number | null },
): Promise<NewHomesCard | null> {
  const [row] = await tx
    .select({ doc: siteContent.doc })
    .from(siteContent)
    .where(and(eq(siteContent.path, "/new-homes-adelaide"), eq(siteContent.status, "published")))
    .limit(1);
  const blocks = ((row?.doc as { blocks?: Record<string, unknown>[] } | undefined)?.blocks ?? []) as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any -- stored page doc, read-only
  const cards: NewHomesCard[] = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    const t = blocks[i + 1];
    if (blocks[i].type === "image" && t?.type === "text" && t.heading) {
      cards.push({
        index: cards.length,
        kind: t.kind ?? null,
        heading: String(t.heading),
        headingEm: t.headingEm ?? null,
        highlights: t.highlights ?? [],
        bullets: t.bullets ?? [],
        specs: t.specs ?? null,
        priceMin: t.priceMin ?? null,
      });
      i += blocks[i + 2]?.type === "cta" ? 2 : 1;
    }
  }
  const name = (l.projectName ?? "").toLowerCase();
  return (
    cards.find((c) => name && `${c.heading} – ${c.headingEm ?? ""}`.toLowerCase() === name) ??
    cards.find((c) => name && name.includes(c.heading.toLowerCase()) && c.headingEm && name.includes(c.headingEm.toLowerCase())) ??
    cards.find((c) => l.suburb && c.heading.toLowerCase() === l.suburb.toLowerCase() && c.priceMin === l.priceMin) ??
    cards.find((c) => l.suburb && c.heading.toLowerCase() === l.suburb.toLowerCase()) ??
    null
  );
}

