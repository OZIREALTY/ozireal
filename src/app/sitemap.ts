import type { MetadataRoute } from "next";
import { suburbsWithListings } from "@/server/public/listings";
import { TOPICS, postHref } from "@/components/public/posts";
import { publishedPosts } from "@/server/public/posts";
import { publishedCustomPaths } from "@/server/public/content";

/**
 * sitemap.xml for the public site: every static page, every blog post (at /blog/<slug>, with
 * the old /post/<slug> redirecting), every journal topic, and one entry per suburb page.
 * Listing detail pages join it when they exist.
 */

/**
 * Built per request, not at build time (2026-11-25): the app is now built on GitHub, which
 * has no database. CloudFront caches it, so Google still gets a fast response.
 */
export const dynamic = "force-dynamic";

const PAGES = [
  "",
  "/all-listings",
  "/sold",
  "/suburbs",
  "/property-services",
  "/property-strategy-services",
  "/overseas-investment",
  "/free-property-appraisal-sa",
  "/free-suburb-insight-report",
  "/property-rental-report",
  "/manage-property-adelaide",
  "/sell-property-house-adelaide",
  "/rent-property-house-adelaide",
  "/buyer-agent-adelaide",
  "/property-investment",
  "/land-opportunities-sa-adelaide",
  "/sell-my-business-australia",
  "/about-adelaide-land-agent",
  "/contact",
  "/blog",
  "/adelaide-property-faq",
  "/privacy",
  "/terms",
  "/complaints",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ozirealty.com.au";
  let suburbs: { slug: string }[] = [];
  try {
    suburbs = await suburbsWithListings();
  } catch {
    // A database hiccup should cost the suburb entries, not the whole sitemap.
  }
  const custom = await publishedCustomPaths();
  const posts = await publishedPosts().catch(() => []);
  return [
    ...PAGES.map((p) => ({ url: base + p })),
    ...custom.map((p) => ({ url: base + p })),
    ...posts.map((p) => ({ url: base + postHref(p), ...(p.date ? { lastModified: p.date } : {}) })),
    ...TOPICS.map((t) => ({ url: `${base}/blog/topic/${t.key}` })),
    ...suburbs.map((s) => ({ url: `${base}/suburbs/${s.slug}` })),
  ];
}
