--------------------------------------------------------------------------------
-- Email-only properties (owner, 2026-11-23): stock the agency shares with its
-- contacts but never advertises: other agents' listings (buyer's agency),
-- investment and overseas deals, businesses for sale.
--
-- website_section 'email_only' is never selected by src/server/public/*, which
-- names 'advertised' or 'new_homes' in every query. The CHECK below is the second
-- lock: such a listing cannot be live or under offer, so no status change can put
-- it on the site either.
--
-- source_url: optional link to where it is advertised (another agent's page,
-- realestate.com.au). Used as the email's button. Not read by the public layer.
--------------------------------------------------------------------------------
ALTER TABLE "listings" DROP CONSTRAINT IF EXISTS "listings_website_section_ck";
ALTER TABLE "listings" ADD CONSTRAINT "listings_website_section_ck"
  CHECK ("website_section" IN ('advertised', 'new_homes', 'email_only'));

ALTER TABLE "listings" DROP CONSTRAINT IF EXISTS "listings_email_only_never_live_ck";
ALTER TABLE "listings" ADD CONSTRAINT "listings_email_only_never_live_ck"
  CHECK ("website_section" <> 'email_only' OR "status" NOT IN ('live', 'under_offer'));

ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "source_url" text;
ALTER TABLE "listings" DROP CONSTRAINT IF EXISTS "listings_source_url_ck";
ALTER TABLE "listings" ADD CONSTRAINT "listings_source_url_ck"
  CHECK ("source_url" IS NULL OR "source_url" ~ '^https?://');
