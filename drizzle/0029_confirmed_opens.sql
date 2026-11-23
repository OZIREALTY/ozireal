--------------------------------------------------------------------------------
-- Confirmed opens (owner, 2026-11-23). open_count counts every fetch of the
-- tracking image, which Apple Mail Privacy Protection and mail scanners inflate.
-- Each fetch is now sorted by what made it (src/server/outbound/open-source.ts):
-- a person's mail app or Gmail's on-open image proxy is a CONFIRMED open; Apple's
-- privacy proxy is AUTOMATIC (it fetches on delivery, read or not); scanners are
-- ignored. open_count and opened_at are kept as they were, so nothing earlier
-- changes meaning. Additive only.
--------------------------------------------------------------------------------
ALTER TABLE "approval_items" ADD COLUMN IF NOT EXISTS "confirmed_opened_at" timestamptz;
ALTER TABLE "approval_items" ADD COLUMN IF NOT EXISTS "confirmed_open_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "approval_items" ADD COLUMN IF NOT EXISTS "auto_open_count" integer NOT NULL DEFAULT 0;
