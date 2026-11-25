--------------------------------------------------------------------------------
-- AI cost (owner, 2026-11-25): the nightly sweep re-ranked every property with
-- Claude even when nothing had changed (~A$0.85 a night for the same answer).
-- input_hash is the sha256 of exactly what the ranker would be sent; a run whose
-- hash matches the property's last successful run is skipped. Additive.
--------------------------------------------------------------------------------
ALTER TABLE "match_runs" ADD COLUMN IF NOT EXISTS "input_hash" text;
CREATE INDEX IF NOT EXISTS "match_runs_property_hash_idx" ON "match_runs" ("property_id", "input_hash");
