import Link from "next/link";
import { InsightsTabs } from "@/components/shell/insights-tabs";
import { PageHeader, Card } from "@/components/ui";
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

const n = (x: number) => x.toLocaleString("en-AU");

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const [{ show = "all" }, rows, ideas] = await Promise.all([searchParams, getBlogList(), getPostIdeas()]);
  const count = {
    all: rows.length,
    draft: rows.filter((r) => r.status !== "published").length,
    published: rows.filter((r) => r.status === "published").length,
    attention: rows.filter((r) => r.needsAttention).length,
  };
  const now = Date.now();
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
              show === f.k ? "bg-[var(--fg)] text-[var(--bg)] border-[var(--fg)]" : "hover:surface-2"
            }`}
          >
            {f.label} {count[f.k]}
          </Link>
        ))}
        <span className="flex-1" />
        <NewPostButton ideas={ideas} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-3 text-left text-[11px] uppercase tracking-[0.06em]">
                <th className="font-medium px-4 py-2.5">Post</th>
                <th className="font-medium px-2 py-2.5">Status</th>
                <th className="font-medium px-2 py-2.5 text-right">Clicks</th>
                <th className="font-medium px-2 py-2.5 text-right">Shown</th>
                <th className="font-medium px-2 py-2.5 text-right">Position</th>
                <th className="font-medium px-4 py-2.5 text-right">vs last month</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const scheduled = r.status === "published" && r.publishedAt && r.publishedAt.getTime() > now;
                const d = r.clicks - r.prevClicks;
                const live = r.status === "published" && !scheduled;
                return (
                  <tr key={r.id} className="border-t hover:surface-2">
                    <td className="px-4 py-2.5 max-w-[460px]">
                      <Link href={`/seo/blog/${r.id}`} className="font-semibold hover:underline block truncate">
                        {r.title}
                      </Link>
                      <span className="text-3 text-[12px] block truncate">
                        {r.status !== "published"
                          ? `Draft${r.aiGenerated ? " · written with AI" : ""} · edited ${r.updatedAt.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`
                          : r.needsAttention ?? `/blog/${r.slug}`}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      {r.status !== "published" ? (
                        <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11.5px] font-semibold text-2">Draft</span>
                      ) : scheduled ? (
                        <span className="rounded-full bg-[#eaf0ff] text-[#2a4bb0] px-2 py-0.5 text-[11.5px] font-semibold">
                          Scheduled {r.publishedAt!.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        </span>
                      ) : r.needsAttention ? (
                        <span className="rounded-full bg-[#fff4db] text-[#946200] px-2 py-0.5 text-[11.5px] font-semibold">Needs attention</span>
                      ) : (
                        <span className="rounded-full bg-[#e8f5ee] text-[#1f7a4d] px-2 py-0.5 text-[11.5px] font-semibold">Published</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular">{live ? n(r.clicks) : "–"}</td>
                    <td className="px-2 py-2.5 text-right tabular">{live ? n(r.impressions) : "–"}</td>
                    <td className="px-2 py-2.5 text-right tabular">{live && r.position ? r.position.toFixed(1) : "–"}</td>
                    <td className={`px-4 py-2.5 text-right tabular ${d > 0 ? "text-[#1f7a4d]" : d < 0 ? "text-[#b02f2f]" : "text-3"}`}>
                      {!live ? "–" : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : "0"}
                    </td>
                  </tr>
                );
              })}
              {!shown.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-2">
                    {rows.length ? "Nothing here." : "No posts yet. Press + New post to write the first one."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-3 text-[12px] mt-2">Clicks, times shown and position: Google Search Console, last 28 days. New posts show figures once Google has indexed them, usually within 1–2 weeks.</p>
    </>
  );
}
