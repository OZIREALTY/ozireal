--------------------------------------------------------------------------------
-- The property card in matched-buyer emails (owner's request, 2026-11-18): a title,
-- a reason to act now and up to six advantages, written by the AI from the property's
-- real facts with the email, reviewed with it, and rendered under the personal text.
--------------------------------------------------------------------------------
ALTER TABLE "approval_items" ADD COLUMN IF NOT EXISTS "card" jsonb;
