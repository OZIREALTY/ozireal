import "dotenv/config";
import { eq } from "drizzle-orm";
import { withTenant, systemTenantId } from "@/db";
import { blogPosts } from "@/db/schema";
import { legacyPosts } from "@/components/public/posts";

/**
 * One-time import of the Wix blog snapshot into blog_posts (2026-11-25).
 *
 *   tsx scripts/import-blog-posts.ts          import (skips any slug already there)
 *   tsx scripts/import-blog-posts.ts --dry    count only
 *
 * Same addresses as before: each post keeps its /blog/<slug>, and wix_slug keeps
 * /post/<wix-slug> redirecting. Published, dated as the original post. Idempotent: a
 * post already in the table (by slug) is left exactly as it is, so edits made in the
 * CRM are never overwritten by a re-run.
 */
const dry = process.argv.includes("--dry");

async function main() {
  const tenantId = await systemTenantId();
  const posts = await legacyPosts();
  let added = 0;
  let kept = 0;
  await withTenant(tenantId, async (tx) => {
    for (const p of posts) {
      const [have] = await tx.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, p.slug)).limit(1);
      if (have) {
        kept++;
        continue;
      }
      added++;
      if (dry) continue;
      const when = p.date ? new Date(`${p.date}T09:00:00+10:30`) : new Date("2025-01-01T09:00:00+10:30");
      const words = p.blocks.reduce((n, b) => n + `${b.text ?? ""} ${(b.items ?? []).join(" ")}`.split(/\s+/).filter(Boolean).length, 0);
      await tx.insert(blogPosts).values({
        tenantId,
        slug: p.slug,
        wixSlug: p.wixSlug,
        title: p.title,
        description: p.description ?? "",
        author: p.author || "Esi Dor",
        coverUrl: p.cover,
        coverAlt: p.coverAlt,
        blocks: p.blocks,
        status: "published",
        publishedAt: when,
        firstPublishedAt: when,
        wordCount: words,
        legacyUrl: `https://www.ozirealty.com.au/post/${p.wixSlug}`,
      });
    }
  });
  console.log(`${dry ? "[dry] " : ""}${added} imported, ${kept} already there, ${posts.length} in the snapshot`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
