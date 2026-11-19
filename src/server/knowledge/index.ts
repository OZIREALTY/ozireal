import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@/db";
import { knowledgeChunks, knowledgeDocs } from "@/db/schema";
import { embedDocuments, embedQuery, embeddingsAvailable, toVectorLiteral } from "@/server/ai/embeddings";

/**
 * The knowledge base (2026-11-19): read a document, split it by section, store the
 * pieces, and search them by exact words and by meaning. Both the office shelf and the
 * legal shelf go through here; the shelf only changes what a citation shows.
 *
 * No `server-only` import: the worker may load this one day, and it cannot.
 */

/* ------------------------------------------------------------------ reading */

export type SourceFile = { name: string; kind: "pdf" | "docx" | "text"; base64: string };

export async function extractText(file: SourceFile): Promise<string> {
  const bytes = Buffer.from(file.base64, "base64");
  if (file.kind === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await pdfText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join("\n\n");
  }
  if (file.kind === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    return value;
  }
  return bytes.toString("utf8");
}

/* ----------------------------------------------------------------- chunking */

export type Chunk = { section: string | null; heading: string | null; text: string };

/** Legislation headings: "12—Duty of agent", "12A. Cooling-off", "Section 7 Form 1". */
const SECTION_RE = /^\s*(?:section\s+)?(\d{1,3}[A-Z]{0,2})(?:\s*(?:—|–|-|\.|:)\s*|\s+)([A-Z][^\n]{2,140})$/;
/** Office documents: markdown headings, or a short line in capitals / ending in a colon. */
const HEADING_RE = /^\s*(?:#{1,4}\s+(.{2,140})|([A-Z][A-Z0-9 &,'/()-]{3,80})|([A-Z][^\n.]{2,80}):)\s*$/;

const TARGET = 1400;
const MAX = 2200;

/**
 * Chunk by section, never by a fixed character count (§7): a citation is only right if
 * a chunk is one section. A section too long for one piece is split at paragraphs and
 * every piece repeats its section and heading.
 */
export function chunkText(raw: string, shelf: "rules" | "office" | "legal"): Chunk[] {
  const text = raw.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];

  type Block = { section: string | null; heading: string | null; lines: string[] };
  const blocks: Block[] = [{ section: null, heading: null, lines: [] }];
  for (const line of text.split("\n")) {
    const s = shelf === "legal" ? SECTION_RE.exec(line) : null;
    const h = !s ? HEADING_RE.exec(line) : null;
    if (s) blocks.push({ section: s[1], heading: s[2].trim(), lines: [] });
    else if (h && line.trim().length < 90) blocks.push({ section: null, heading: (h[1] ?? h[2] ?? h[3]).trim(), lines: [] });
    else blocks[blocks.length - 1].lines.push(line);
  }

  const out: Chunk[] = [];
  for (const b of blocks) {
    const body = b.lines.join("\n").trim();
    if (!body) continue;
    const paras = body.split(/\n\s*\n/);
    let cur = "";
    const flush = () => {
      if (cur.trim()) out.push({ section: b.section, heading: b.heading, text: cur.trim() });
      cur = "";
    };
    for (const p of paras) {
      // A single paragraph longer than MAX is cut at sentences.
      const pieces = p.length > MAX ? p.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [p] : [p];
      for (const piece of pieces) {
        if (cur && cur.length + piece.length > TARGET) flush();
        cur += (cur ? "\n\n" : "") + piece;
      }
    }
    flush();
  }

  // Merge tiny untitled fragments into their neighbour so search is not flooded.
  return out.filter((c, i) => c.text.length >= 40 || c.heading || i === 0);
}

/* ------------------------------------------------------------------ storing */

export async function storeDocument(
  tx: Tx,
  tenantId: string,
  doc: {
    shelf: "rules" | "office" | "legal";
    title: string;
    source: "upload" | "paste" | "link" | "official";
    sourceRef?: string | null;
    jurisdiction?: string | null;
    instrument?: string | null;
    versionDate?: string | null;
    addedBy?: string | null;
  },
  text: string,
) {
  const chunks = chunkText(text, doc.shelf);
  if (chunks.length === 0) throw new Error("No readable text was found in that document.");
  const [row] = await tx
    .insert(knowledgeDocs)
    .values({ ...doc, tenantId, chars: text.length, chunks: chunks.length })
    .returning({ id: knowledgeDocs.id });
  for (let i = 0; i < chunks.length; i += 200) {
    await tx.insert(knowledgeChunks).values(
      chunks.slice(i, i + 200).map((c, j) => ({ tenantId, docId: row.id, idx: i + j, ...c })),
    );
  }
  return { id: row.id, chunks: chunks.length };
}

async function vectorReady(tx: Tx): Promise<boolean> {
  const r = await tx.execute<{ ok: boolean }>(
    sql`select exists (select 1 from information_schema.columns
          where table_name = 'knowledge_chunks' and column_name = 'embedding') as ok`,
  );
  return Boolean(r[0]?.ok);
}

/**
 * Embed a document's pieces after it is saved. Best effort: if Bedrock or pgvector is
 * unavailable the document is still searchable by its words, and the list says so.
 */
export async function embedDocument(tenantId: string, docId: string) {
  if (!embeddingsAvailable()) return;
  const rows = await withTenant(tenantId, async (tx) =>
    (await vectorReady(tx))
      ? tx.execute<{ id: string; text: string; heading: string | null; section: string | null }>(
          sql`select id, text, heading, section from knowledge_chunks where doc_id = ${docId} order by idx`,
        )
      : null,
  );
  if (!rows) return;
  const list = [...rows];
  for (let i = 0; i < list.length; i += 16) {
    const batch = list.slice(i, i + 16);
    const vectors = await embedDocuments(
      tenantId,
      batch.map((c) => [c.section && `Section ${c.section}`, c.heading, c.text].filter(Boolean).join("\n")),
      { type: "knowledge_doc", id: docId },
    );
    await withTenant(tenantId, async (tx) => {
      for (let j = 0; j < batch.length; j++) {
        await tx.execute(
          sql`update knowledge_chunks set embedding = ${toVectorLiteral(vectors[j])}::vector where id = ${batch[j].id}`,
        );
      }
    });
  }
  await withTenant(tenantId, (tx) => tx.execute(sql`update knowledge_docs set embedded = true where id = ${docId}`));
}

/* ---------------------------------------------------------------- searching */

export type KnowledgeHit = {
  document: string;
  shelf: "rules" | "office" | "legal";
  section: string | null;
  heading: string | null;
  jurisdiction: string | null;
  instrument: string | null;
  versionDate: string | null;
  text: string;
};

type Row = KnowledgeHit & { id: string };

/**
 * Exact words (Postgres full-text) and meaning (pgvector cosine), merged by
 * Reciprocal Rank Fusion (§7). Legal hits are filtered to the jurisdiction asked
 * about BEFORE ranking, so one state's rules never answer another state's question.
 */
export async function searchKnowledge(
  tenantId: string,
  query: string,
  opts: { shelf?: "rules" | "office" | "legal"; jurisdiction?: string; limit?: number } = {},
): Promise<KnowledgeHit[]> {
  const limit = opts.limit ?? 8;
  const shelf = opts.shelf ?? null;
  const juris = opts.jurisdiction?.toUpperCase() ?? null;
  const filter = sql`(${shelf}::text is null or d.shelf = ${shelf})
    and (${juris}::text is null or d.shelf = 'office' or d.jurisdiction is null or upper(d.jurisdiction) in (${juris}, 'CTH'))`;
  const cols = sql`c.id, d.title as document, d.shelf, c.section, c.heading, d.jurisdiction, d.instrument,
    to_char(d.version_date, 'YYYY-MM-DD') as "versionDate", c.text`;

  const vector = embeddingsAvailable()
    ? await embedQuery(tenantId, query, { type: "knowledge_search", id: tenantId }).catch(() => null)
    : null;

  return withTenant(tenantId, async (tx) => {
    const words = await tx.execute<Row>(sql`
      select ${cols} from knowledge_chunks c join knowledge_docs d on d.id = c.doc_id
      where ${filter} and c.tsv @@ websearch_to_tsquery('english', ${query})
      order by ts_rank(c.tsv, websearch_to_tsquery('english', ${query})) desc limit 30`);
    // Loose fallback: any of the words, for questions phrased unlike the document.
    const loose = words.length
      ? []
      : await tx.execute<Row>(sql`
          select ${cols} from knowledge_chunks c join knowledge_docs d on d.id = c.doc_id
          where ${filter} and c.tsv @@ to_tsquery('english', ${orQuery(query)})
          order by ts_rank(c.tsv, to_tsquery('english', ${orQuery(query)})) desc limit 30`).catch(() => []);
    const meaning =
      vector && (await vectorReady(tx))
        ? await tx.execute<Row>(sql`
            select ${cols} from knowledge_chunks c join knowledge_docs d on d.id = c.doc_id
            where ${filter} and c.embedding is not null
            order by c.embedding <=> ${toVectorLiteral(vector)}::vector limit 30`)
        : [];

    const score = new Map<string, { row: Row; s: number }>();
    for (const list of [[...words, ...loose], [...meaning]]) {
      list.forEach((row, rank) => {
        const cur = score.get(row.id) ?? { row, s: 0 };
        cur.s += 1 / (60 + rank);
        score.set(row.id, cur);
      });
    }
    return [...score.values()]
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map(({ row: { id: _id, ...hit } }) => ({ ...hit, text: hit.text.slice(0, 1800) }));
  });
}

function orQuery(q: string): string {
  const words = q.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return [...new Set(words)].slice(0, 12).join(" | ") || "nothing";
}

/* ----------------------------------------------------------------- training */

/** Characters of owner training sent with every call. Cached, so repeats are cheap. */
const RULES_BUDGET = 12_000;
const KNOW_BUDGET = 24_000;
const TRAINING_TTL_MS = 60_000;
const trainingCache = new Map<string, { text: string; at: number }>();

/** Called after an add or remove so the next AI call sees the change at once. */
export function forgetTraining(tenantId: string) {
  trainingCache.delete(tenantId);
}

/**
 * The owner's training for the AI (2026-11-19: "the knowledge base is for the AI
 * training"). Instructions and agency knowledge go into the system prompt of EVERY
 * Claude call, so the assistant, email drafts, matching and content all follow them.
 * Anything past the budget is still reachable through search_knowledge. The legal
 * library is never pasted in: it is searched and cited (§3.3).
 */
export async function trainingText(tenantId: string): Promise<string> {
  const hit = trainingCache.get(tenantId);
  if (hit && Date.now() - hit.at < TRAINING_TTL_MS) return hit.text;

  const rows = await withTenant(tenantId, (tx) =>
    tx.execute<{ shelf: "rules" | "office"; title: string; heading: string | null; text: string }>(sql`
      select d.shelf, d.title, c.heading, c.text
      from knowledge_chunks c join knowledge_docs d on d.id = c.doc_id
      where d.shelf in ('rules', 'office')
      order by d.shelf desc, d.created_at desc, c.idx`),
  ).catch(() => []);

  const take = (shelf: "rules" | "office", budget: number) => {
    let used = 0;
    let lastTitle = "";
    const out: string[] = [];
    for (const r of rows) {
      if (r.shelf !== shelf) continue;
      const head = r.title !== lastTitle ? `\n### ${r.title}\n` : "";
      const piece = `${head}${r.heading ? `${r.heading}: ` : ""}${r.text}\n`;
      if (used + piece.length > budget) {
        out.push("\n(More on file: use search_knowledge where that tool exists.)");
        break;
      }
      out.push(piece);
      used += piece.length;
      lastTitle = r.title;
    }
    return out.join("");
  };

  const rules = take("rules", RULES_BUDGET);
  const know = take("office", KNOW_BUDGET);
  const text =
    rules || know
      ? [
          "# Training from the agency owner",
          "The owner wrote or chose everything below to train you. Follow the instructions in all your work, and treat the knowledge as true about this agency, ahead of general knowledge. Where the task's own instructions require a fixed format (for example JSON only), keep that format and apply this training within it.",
          rules && `\n## Instructions\n${rules}`,
          know && `\n## What to know about the agency\n${know}`,
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  trainingCache.set(tenantId, { text, at: Date.now() });
  return text;
}
