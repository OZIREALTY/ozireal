import { desc, eq, sql } from "drizzle-orm";
import { query } from "@/db";
import { blogPosts, type BlogBlock } from "@/db/schema";

/**
 * SEO -> Blog (2026-11-25): every post with its Google numbers. Search Console reports
 * pages by full URL, so a post's figures are the rows whose page is its /blog address.
 * 28 days to the newest synced day, against the 28 before.
 */
const SITE = "https://www.ozirealty.com.au";

export type BlogListRow = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "in_approval" | "published" | "archived";
  publishedAt: Date | null;
  updatedAt: Date;
  aiGenerated: boolean;
  clicks: number;
  impressions: number;
  position: number | null;
  prevClicks: number;
  needsAttention: string | null;
};

export async function getBlogList(): Promise<BlogListRow[]> {
  return query(async (tx) => {
    const rows = await tx.execute<{
      id: string;
      slug: string;
      title: string;
      status: BlogListRow["status"];
      published_at: Date | null;
      updated_at: Date;
      ai_generated: boolean;
      clicks: number;
      impressions: number;
      position: number | null;
      prev_clicks: number;
      days_live: number | null;
    }>(sql`
      with last as (select max(day) d from seo_search_daily),
      cur as (
        select page, sum(clicks)::int clicks, sum(impressions)::int impressions,
               sum(position*impressions)/nullif(sum(impressions),0) position
        from seo_search_daily, last where day > last.d - 28 group by page),
      prev as (
        select page, sum(clicks)::int clicks
        from seo_search_daily, last where day > last.d - 56 and day <= last.d - 28 group by page)
      select b.id, b.slug, b.title, b.status, b.published_at, b.updated_at, b.ai_generated,
             coalesce(cur.clicks,0) clicks, coalesce(cur.impressions,0) impressions, cur.position,
             coalesce(prev.clicks,0) prev_clicks,
             extract(day from now() - b.published_at)::int days_live
      from blog_posts b
      left join cur on cur.page = ${SITE} || '/blog/' || b.slug
      left join prev on prev.page = ${SITE} || '/blog/' || b.slug
      order by case when b.status = 'draft' then 0 else 1 end, b.published_at desc nulls first, b.updated_at desc`);
    return rows.map((r) => {
      const live = r.status === "published";
      const dropped = r.prev_clicks - r.clicks;
      const needsAttention = !live
        ? null
        : dropped >= 3
          ? `${dropped} fewer clicks than the month before`
          : (r.days_live ?? 0) > 45 && r.impressions === 0
            ? "Google has not shown it in 28 days"
            : null;
      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        status: r.status,
        publishedAt: r.published_at ? new Date(r.published_at) : null,
        updatedAt: new Date(r.updated_at),
        aiGenerated: r.ai_generated,
        clicks: r.clicks,
        impressions: r.impressions,
        position: r.position == null ? null : Number(r.position),
        prevClicks: r.prev_clicks,
        needsAttention,
      };
    });
  });
}

export type BlogEditorPost = {
  id: string;
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  targetSearch: string;
  coverUrl: string;
  coverAlt: string;
  coverCredit: string;
  blocks: BlogBlock[];
  status: BlogListRow["status"];
  publishedAt: string | null;
  firstPublishedAt: string | null;
  aiGenerated: boolean;
  updatedAt: string;
};

export async function getBlogPost(id: string): Promise<BlogEditorPost | null> {
  return query(async (tx) => {
    const [p] = await tx.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
    if (!p) return null;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      seoTitle: p.seoTitle ?? "",
      description: p.description,
      targetSearch: p.targetSearch ?? "",
      coverUrl: p.coverUrl ?? "",
      coverAlt: p.coverAlt,
      coverCredit: p.coverCredit,
      blocks: p.blocks ?? [],
      status: p.status,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      firstPublishedAt: p.firstPublishedAt?.toISOString() ?? null,
      aiGenerated: p.aiGenerated,
      updatedAt: p.updatedAt.toISOString(),
    };
  });
}

/** Searches you are shown for with no post targeting them: for "From a search". */
export async function getPostIdeas(limit = 12) {
  return query(async (tx) => {
    const rows = await tx.execute<{ query: string; impressions: number; position: number }>(sql`
      with last as (select max(day) d from seo_search_daily)
      select s.query, sum(s.impressions)::int impressions,
             (sum(s.position*s.impressions)/nullif(sum(s.impressions),0))::float position
      from seo_search_daily s, last
      where s.day > last.d - 90
        and not exists (select 1 from blog_posts b where lower(coalesce(b.target_search,'')) = lower(s.query))
      group by s.query
      having sum(s.impressions) >= 20
      order by impressions desc
      limit ${limit}`);
    return rows.map((r) => ({ query: r.query, impressions: r.impressions, position: Number(r.position) }));
  });
}

export async function getBlogSlugs() {
  return query((tx) => tx.select({ slug: blogPosts.slug, title: blogPosts.title }).from(blogPosts).orderBy(desc(blogPosts.publishedAt)));
}
