import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogList } from "@/components/public/blog-list";
import { TOPICS, topicLabel } from "@/components/public/posts";

/** One indexable page per journal topic, with that topic pre-selected in the filter. */

/** Posts come from the database since 2026-11-25, so this renders per request. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  const { topic } = await params;
  const label = topicLabel(topic);
  return {
    title: `${label} in Adelaide: Guides and Tips`,
    description: `Practical ${label.toLowerCase()} guides for Adelaide and South Australian property owners, buyers and investors.`,
    alternates: { canonical: `/blog/topic/${topic}` },
  };
}

export default async function Page({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  if (!TOPICS.some((t) => t.key === topic)) notFound();
  return <BlogList topic={topic} />;
}
