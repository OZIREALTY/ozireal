--------------------------------------------------------------------------------
-- Search Console data (owner, 2026-11-24): one row per day, search phrase and page,
-- pulled daily from Google Search Console by the worker (SyncSearchConsole). Read
-- only, free, keyless (AWS -> Google workload identity federation). Rows are
-- replaced per day, so a re-sync of a day overwrites rather than duplicates.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "seo_search_daily" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "day" date NOT NULL,
  "query" text NOT NULL,
  "page" text NOT NULL,
  "clicks" integer NOT NULL DEFAULT 0,
  "impressions" integer NOT NULL DEFAULT 0,
  "position" real NOT NULL DEFAULT 0,
  PRIMARY KEY ("tenant_id", "day", "query", "page")
);
CREATE INDEX IF NOT EXISTS "seo_search_daily_tenant_day_idx" ON "seo_search_daily" ("tenant_id", "day");

ALTER TABLE "seo_search_daily" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "seo_search_daily";
CREATE POLICY "tenant_isolation" ON "seo_search_daily"
  USING ("tenant_id" = current_tenant_id())
  WITH CHECK ("tenant_id" = current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "seo_search_daily" TO ozirealty_app;
