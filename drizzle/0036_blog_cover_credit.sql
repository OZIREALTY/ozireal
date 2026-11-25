-- Cover photo credit (owner, 2026-11-25): "Photo: <name> / Pixabay" under a stock cover.
-- Empty for the owner's own uploads.
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_credit text NOT NULL DEFAULT '';
