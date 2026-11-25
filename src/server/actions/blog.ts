"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { defineAction, ActionError } from "./action";
import { blogPosts } from "@/db/schema";

/**
 * SEO -> Blog (owner-approved preview, 2026-11-25). A person writes, saves and publishes;
 * nothing here publishes on its own. Publishing makes the post live at once (the blog
 * pages read the table per request) and adds it to the sitemap.
 *
 * The address (slug) can change while a post is a draft and is fixed once it has ever
 * been published: Google ranks the address, and changing it would throw that away.
 */

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-[^-]*$/, (m) => (m.length < 3 ? "" : m)) || "post";

const block = z.object({
  t: z.enum(["p", "h2", "h3", "ul"]),
  text: z.string().max(6000).optional(),
  items: z.array(z.string().max(1000)).max(50).optional(),
});

const words = (blocks: z.infer<typeof block>[]) =>
  blocks.reduce((n, b) => n + `${b.text ?? ""} ${(b.items ?? []).join(" ")}`.split(/\s+/).filter(Boolean).length, 0);

const touch = (slug?: string) => {
  revalidatePath("/seo/blog");
  revalidatePath("/blog");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/blog/${slug}`);
};

export const createBlogPost = defineAction({
  input: z.object({
    title: z.string().trim().max(160).default(""),
    targetSearch: z.string().trim().max(160).default(""),
  }),
  async handler(input, ctx) {
    const title = input.title || (input.targetSearch ? input.targetSearch[0].toUpperCase() + input.targetSearch.slice(1) : "Untitled post");
    let slug = slugify(input.targetSearch || title);
    for (let n = 2; ; n++) {
      const [clash] = await ctx.tx.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
      if (!clash) break;
      slug = `${slugify(input.targetSearch || title)}-${n}`;
    }
    const [p] = await ctx.tx
      .insert(blogPosts)
      .values({
        tenantId: ctx.tenantId,
        slug,
        title,
        targetSearch: input.targetSearch || null,
        status: "draft",
        blocks: [{ t: "p", text: "" }],
      })
      .returning({ id: blogPosts.id });
    await ctx.audit({ kind: "edit", action: "Started a blog post", target: title, entityType: "blog_post", entityId: p.id });
    revalidatePath("/seo/blog");
    return { id: p.id };
  },
});

export const saveBlogPost = defineAction({
  input: z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(3, "Give it a title").max(160),
    seoTitle: z.string().trim().max(70).default(""),
    description: z.string().trim().max(170).default(""),
    targetSearch: z.string().trim().max(160).default(""),
    slug: z.string().trim().max(90).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lower-case words joined by dashes").optional(),
    coverUrl: z.union([z.literal(""), z.string().max(500).regex(/^(\/|https:\/\/)/)]).default(""),
    coverAlt: z.string().trim().max(200).default(""),
    blocks: z.array(block).max(400),
  }),
  async handler(input, ctx) {
    const [p] = await ctx.tx
      .select({ slug: blogPosts.slug, first: blogPosts.firstPublishedAt })
      .from(blogPosts)
      .where(eq(blogPosts.id, input.id))
      .limit(1);
    if (!p) throw new ActionError("That post no longer exists.");
    let slug = p.slug;
    if (input.slug && input.slug !== p.slug) {
      if (p.first) throw new ActionError("The address is fixed once a post has been published.");
      const [clash] = await ctx.tx
        .select({ id: blogPosts.id })
        .from(blogPosts)
        .where(and(eq(blogPosts.slug, input.slug), ne(blogPosts.id, input.id)))
        .limit(1);
      if (clash) throw new ActionError("Another post already uses that address.");
      slug = input.slug;
    }
    const savedAt = new Date();
    await ctx.tx
      .update(blogPosts)
      .set({
        title: input.title,
        seoTitle: input.seoTitle || null,
        description: input.description,
        targetSearch: input.targetSearch || null,
        slug,
        coverUrl: input.coverUrl || null,
        coverAlt: input.coverAlt,
        blocks: input.blocks,
        wordCount: words(input.blocks),
        updatedAt: savedAt,
      })
      .where(eq(blogPosts.id, input.id));
    // A published post's edits are live at once; a draft's are not public at all.
    touch(slug);
    return { savedAt: savedAt.toISOString(), slug };
  },
});

export const publishBlogPost = defineAction({
  input: z.object({
    id: z.string().uuid(),
    /** Empty = now; otherwise an ISO date-time in the future (scheduled). */
    at: z.union([z.literal(""), z.string().datetime({ offset: true })]).default(""),
  }),
  async handler(input, ctx) {
    const [p] = await ctx.tx.select().from(blogPosts).where(eq(blogPosts.id, input.id)).limit(1);
    if (!p) throw new ActionError("That post no longer exists.");
    if (p.title.trim().length < 3) throw new ActionError("Give it a title before publishing.");
    if (words(p.blocks ?? []) < 80) throw new ActionError("The post is very short. Write at least a few paragraphs before publishing.");
    const at = input.at ? new Date(input.at) : new Date();
    await ctx.tx
      .update(blogPosts)
      .set({ status: "published", publishedAt: at, firstPublishedAt: p.firstPublishedAt ?? at, updatedAt: new Date() })
      .where(eq(blogPosts.id, input.id));
    await ctx.audit({
      kind: "edit",
      action: at > new Date() ? `Scheduled a blog post for ${at.toISOString().slice(0, 16)}` : "Published a blog post",
      target: p.title,
      entityType: "blog_post",
      entityId: p.id,
    });
    touch(p.slug);
    return { slug: p.slug, scheduled: at > new Date() };
  },
});

export const unpublishBlogPost = defineAction({
  input: z.object({ id: z.string().uuid() }),
  async handler(input, ctx) {
    const [p] = await ctx.tx.select({ slug: blogPosts.slug, title: blogPosts.title }).from(blogPosts).where(eq(blogPosts.id, input.id)).limit(1);
    if (!p) throw new ActionError("That post no longer exists.");
    await ctx.tx.update(blogPosts).set({ status: "draft", updatedAt: new Date() }).where(eq(blogPosts.id, input.id));
    await ctx.audit({ kind: "edit", action: "Took a blog post off the website", target: p.title, entityType: "blog_post", entityId: input.id });
    touch(p.slug);
    return { ok: true };
  },
});

export const deleteBlogPost = defineAction({
  input: z.object({ id: z.string().uuid() }),
  async handler(input, ctx) {
    const [p] = await ctx.tx.select({ title: blogPosts.title, first: blogPosts.firstPublishedAt }).from(blogPosts).where(eq(blogPosts.id, input.id)).limit(1);
    if (!p) throw new ActionError("That post no longer exists.");
    // A post that was ever live keeps its row (and address): take it off the site instead.
    if (p.first) throw new ActionError("A post that has been published can't be deleted. Take it off the website instead.");
    await ctx.tx.delete(blogPosts).where(eq(blogPosts.id, input.id));
    await ctx.audit({ kind: "edit", action: "Deleted a draft blog post", target: p.title, entityType: "blog_post", entityId: input.id });
    revalidatePath("/seo/blog");
    return { ok: true };
  },
});

/**
 * Bulk actions on the Blog list (owner, 2026-11-25). Each post is handled by the same
 * rules as one at a time: delete only drafts that were never published, publish only
 * posts with a title and some text, take off any live post. Reports what it skipped.
 */
export const bulkBlogPosts = defineAction({
  input: z.object({
    ids: z.array(z.string().uuid()).min(1, "Tick at least one post").max(200),
    op: z.enum(["publish", "unpublish", "delete"]),
  }),
  async handler(input, ctx) {
    let done = 0;
    const skipped: string[] = [];
    for (const id of input.ids) {
      const [p] = await ctx.tx.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
      if (!p) continue;
      if (input.op === "delete") {
        if (p.firstPublishedAt || p.status === "published") {
          skipped.push(`${p.title} (published: take it off instead)`);
          continue;
        }
        await ctx.tx.delete(blogPosts).where(eq(blogPosts.id, id));
      } else if (input.op === "unpublish") {
        if (p.status !== "published") continue;
        await ctx.tx.update(blogPosts).set({ status: "draft", updatedAt: new Date() }).where(eq(blogPosts.id, id));
      } else {
        if (p.status === "published") continue;
        if (p.title.trim().length < 3 || words(p.blocks ?? []) < 80) {
          skipped.push(`${p.title} (too short to publish)`);
          continue;
        }
        const at = new Date();
        await ctx.tx
          .update(blogPosts)
          .set({ status: "published", publishedAt: at, firstPublishedAt: p.firstPublishedAt ?? at, updatedAt: at })
          .where(eq(blogPosts.id, id));
      }
      done++;
    }
    await ctx.audit({
      kind: "edit",
      action: `${input.op === "delete" ? "Deleted" : input.op === "unpublish" ? "Took off the website" : "Published"} ${done} blog post${done === 1 ? "" : "s"}`,
      target: `${done} posts`,
      entityType: "blog_post",
    });
    touch();
    return { done, skipped };
  },
});
