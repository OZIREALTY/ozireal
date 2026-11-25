import Link from "next/link";
import { InsightsTabs } from "@/components/shell/insights-tabs";
import { PageHeader } from "@/components/ui";
import { BlogTable } from "@/components/seo/blog-table";
import { SeoTabs } from "@/components/seo/seo-tabs";
import { NewPostButton } from "@/components/seo/new-post";
import { getBlogList, getPostIdeas } from "@/server/queries/blog";

/**
 * SEO -> Blog (owner-approved preview, 2026-11-25): every post with its Google numbers.
 * Drafts first, then published newest first. A post that is losing clicks, or that Google
 * has stopped showing, is flagged "Needs attention".
 */
export const dynamic = "force-dynamic";

const FILTERS = [
  { k: "all", label: "All" },
  { k: "draft", label: "Drafts" },
  { k: "published", label: "Published" },
  { k: "attention", label: "Needs attention" },
] as const;


export default async function BlogPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const [{ show = "all" }, rows, ideas] = await Promise.all([searchParams, getBlogList(), getPostIdeas()]);
  const count = {
    all: rows.length,
    draft: rows.filter((r) => r.status !== "published").length,
    published: rows.filter((r) => r.status === "published").length,
    attention: rows.filter((r) => r.needsAttention).length,
  };
  const shown = rows.filter((r) =>
    show === "draft" ? r.status !== "published" : show === "published" ? r.status === "published" : show === "attention" ? !!r.needsAttention : true,
  );

  return (
    <>
      <InsightsTabs />
      <PageHeader title="SEO" subtitle="How ozirealty.com.au does in Google, and the blog posts that grow it." />
      <SeoTabs counts={{ "/seo/blog": rows.length }} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {FILTERS.map((f) => (
          <Link
            key={f.k}
            href={f.k === "all" ? "/seo/blog" : `/seo/blog?show=${f.k}`}
            className={`rounded-lg border px-3 min-h-9 inline-flex items-center text-[13px] font-semibold ${
              show === f.k ? "bg-[var(--text)] text-[var(--surface-2)] border-[var(--text)]" : "hover:surface-2"
            }`}
          >
            {f.label} {count[f.k]}
          </Link>
        ))}
        <span className="flex-1" />
        <NewPostButton ideas={ideas} />
      </div>

      <BlogTable
        rows={shown.map((r) => ({ ...r, publishedAt: r.publishedAt?.toISOString() ?? null, updatedAt: r.updatedAt.toISOString() }))}
        empty={rows.length ? "Nothing here." : "No posts yet. Press + New post to write the first one."}
      />
      <p className="text-3 text-[12px] mt-2">Clicks, times shown and position: Google Search Console, last 28 days. New posts show figures once Google has indexed them, usually within 1–2 weeks.</p>
    </>
  );
}
