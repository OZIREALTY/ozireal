--------------------------------------------------------------------------------
-- AI training (owner, 2026-11-19: "the knowledge base is for the AI training"). Three
-- shelves: "rules" and "office" ride on every AI call; "legal" is searched and cited.
-- The owner adds to any shelf by typing, upload or link; official legal
-- sources are loaded only after their licence is confirmed (CLAUDE.md §15).
--
-- A document is split into chunks, by section where the text has sections. Each
-- chunk carries what a citation needs: the document, section and heading, plus
-- jurisdiction / instrument / version date on the legal shelf (§7).
--
-- Search is exact words (Postgres full-text) merged with meaning (pgvector), the
-- vector column existing only where pgvector does, as in 0010.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "knowledge_docs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "shelf" text NOT NULL CHECK ("shelf" IN ('rules','office','legal')),
  "title" text NOT NULL,
  "source" text NOT NULL CHECK ("source" IN ('upload','paste','link','official')),
  "source_ref" text,
  "jurisdiction" text,
  "instrument" text,
  "version_date" date,
  "chars" integer NOT NULL DEFAULT 0,
  "chunks" integer NOT NULL DEFAULT 0,
  "embedded" boolean NOT NULL DEFAULT false,
  "added_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "knowledge_docs_shelf_idx" ON "knowledge_docs" ("tenant_id", "shelf", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "doc_id" uuid NOT NULL REFERENCES "knowledge_docs"("id") ON DELETE CASCADE,
  "idx" integer NOT NULL,
  "section" text,
  "heading" text,
  "text" text NOT NULL,
  "tsv" tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("heading", '') || ' ' || coalesce("section", '') || ' ' || "text")
  ) STORED
);
CREATE INDEX IF NOT EXISTS "knowledge_chunks_doc_idx" ON "knowledge_chunks" ("doc_id", "idx");
CREATE INDEX IF NOT EXISTS "knowledge_chunks_tsv_idx" ON "knowledge_chunks" USING gin ("tsv");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE "knowledge_chunks" ADD COLUMN IF NOT EXISTS "embedding" vector(1024);
    CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_idx"
      ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
  END IF;
END $$;

ALTER TABLE "knowledge_docs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "knowledge_docs";
CREATE POLICY "tenant_isolation" ON "knowledge_docs"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_docs" TO ozirealty_app;

ALTER TABLE "knowledge_chunks" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "knowledge_chunks";
CREATE POLICY "tenant_isolation" ON "knowledge_chunks"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "knowledge_chunks" TO ozirealty_app;
