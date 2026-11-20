--------------------------------------------------------------------------------
-- Email insights (owner, 2026-11-20): opens, clicks and replies per sent email.
-- One row per email already exists (approval_items); these columns record what
-- happened after the send. Opens come from a tracking image (a rough signal), clicks
-- from the listing link routed through the CRM, replies from the agency's Gmail
-- (option A, owner-approved: only replies to these emails are read).
--------------------------------------------------------------------------------
ALTER TABLE "approval_items" ADD COLUMN IF NOT EXISTS "opened_at" timestamptz;
ALTER TABLE "approval_items" ADD COLUMN IF NOT EXISTS "open_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "approval_items" ADD COLUMN IF NOT EXISTS "clicked_at" timestamptz;
ALTER TABLE "approval_items" ADD COLUMN IF NOT EXISTS "click_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "approval_items" ADD COLUMN IF NOT EXISTS "replied_at" timestamptz;
ALTER TABLE "approval_items" ADD COLUMN IF NOT EXISTS "reply_snippet" text;
CREATE INDEX IF NOT EXISTS "approval_items_sent_idx" ON "approval_items" ("tenant_id", "sent_at" DESC) WHERE "sent_at" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "approval_items_msgid_idx" ON "approval_items" ("provider_message_id") WHERE "provider_message_id" IS NOT NULL;
