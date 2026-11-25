--------------------------------------------------------------------------------
-- Blog in the CRM (owner, 2026-11-25). Posts move out of src/content/posts.json into
-- blog_posts (which has existed, empty, since 0000) so a post is written, edited and
-- published from SEO -> Blog and goes live in seconds with no deploy. The 51 existing
-- posts are imported by scripts/import-blog-posts.ts with the SAME addresses (slug) and
-- their old Wix slug (wix_slug), so /post/<wix-slug> keeps redirecting.
--
-- Public pages read it only through src/server/public/posts.ts, which names every
-- column it returns and filters on status/published_at (rule 3.8). RLS has covered
-- this table since 0005. Additive only.
--------------------------------------------------------------------------------
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "wix_slug" text;
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "seo_title" text;
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '';
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "target_search" text;
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "author" text NOT NULL DEFAULT 'Esi Dor';
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "cover_url" text;
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "cover_alt" text NOT NULL DEFAULT '';
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "first_published_at" timestamptz;
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "ai_generated" boolean NOT NULL DEFAULT false;
ALTER TABLE "blog_posts" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "blog_posts" DROP CONSTRAINT IF EXISTS "blog_posts_slug_ck";
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_slug_ck" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
CREATE INDEX IF NOT EXISTS "blog_posts_tenant_status_idx" ON "blog_posts" ("tenant_id", "status", "published_at");
