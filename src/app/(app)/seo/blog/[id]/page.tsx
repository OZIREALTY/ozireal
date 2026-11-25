import { notFound } from "next/navigation";
import { getBlogPost, getBlogSlugs } from "@/server/queries/blog";
import { BlogEditor } from "@/components/seo/blog-editor";

/** SEO -> Blog -> one post, in the editor (owner-approved preview, 2026-11-25). */
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [post, others] = await Promise.all([getBlogPost(id), getBlogSlugs()]);
  if (!post) notFound();
  return <BlogEditor post={post} posts={others.filter((o) => o.slug !== post.slug)} />;
}
