import { cache } from "react";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { blogPosts } from "@/db/schema";
import type { Post } from "@/components/public/posts";
import { publicQuery } from "./tenant";

/**
 * Blog posts as the public site may see them (rule 8, 2026-11-25).
 *
 * Only published posts whose publish time has come (a scheduled post stays hidden until
 * then), and only the named fields below: never the target search, the AI flag, drafts
 * or timestamps beyond the date. Cached per request, so a page that needs the list in
 * three places queries once.
 */
export const publishedPosts = cache(async (): Promise<Post[]> => {
  const rows = await publicQuery((tx) =>
    tx
      .select({
        slug: blogPosts.slug,
        wixSlug: blogPosts.wixSlug,
        title: blogPosts.title,
        seoTitle: blogPosts.seoTitle,
        description: blogPosts.description,
        author: blogPosts.author,
        cover: blogPosts.coverUrl,
        coverAlt: blogPosts.coverAlt,
        coverCredit: blogPosts.coverCredit,
        blocks: blogPosts.blocks,
        date: sql<string>`to_char(${blogPosts.publishedAt} at time zone 'Australia/Adelaide', 'YYYY-MM-DD')`,
      })
      .from(blogPosts)
      .where(and(eq(blogPosts.status, "published"), lte(blogPosts.publishedAt, sql`now()`)))
      .orderBy(desc(blogPosts.publishedAt)),
  );
  return rows.map((r) => ({
    slug: r.slug,
    wixSlug: r.wixSlug,
    title: r.title,
    seoTitle: r.seoTitle,
    description: r.description,
    date: r.date ?? "",
    author: r.author,
    cover: r.cover,
    coverAlt: r.coverAlt || r.title,
    coverCredit: r.coverCredit,
    blocks: r.blocks ?? [],
  }));
});
