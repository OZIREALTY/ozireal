import { notFound, permanentRedirect } from "next/navigation";
import { postByWixSlug, postHref } from "@/components/public/posts";
import { publishedPosts } from "@/server/public/posts";

/**
 * The old Wix address, /post/<wix-slug>. Posts moved to /blog/<slug> on 2026-10-31;
 * this permanently redirects (308, which search engines treat as a 301) so every indexed
 * URL and backlink lands on the new one. Read from the database since 2026-11-25.
 */
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const post = postByWixSlug(await publishedPosts(), (await params).slug);
  if (!post) notFound();
  permanentRedirect(postHref(post));
}
