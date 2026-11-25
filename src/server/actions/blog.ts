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
    coverCredit: z.string().trim().max(120).default(""),
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
        coverCredit: input.coverUrl ? input.coverCredit : "",
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

/**
 * Write with AI (owner-approved, 2026-11-25): on request only, one draft per press,
 * logged with its cost like every AI call (rule 7). The result is a DRAFT in the editor;
 * publishing is still a person pressing Publish (rule 1). The prompt forbids invented
 * figures, and the editor lists every sentence with a number for checking.
 */
const aiDraft = z.object({
  title: z.string().trim().min(5).max(120),
  seoTitle: z.preprocess((v) => String(v ?? "").trim().slice(0, 70), z.string()),
  description: z.preprocess((v) => String(v ?? "").trim().slice(0, 170), z.string()),
  coverAlt: z.preprocess((v) => String(v ?? "").trim().slice(0, 200), z.string()),
  blocks: z
    .array(
      z.object({
        t: z.enum(["p", "h2", "h3", "ul"]),
        text: z.preprocess((v) => (v == null ? undefined : String(v).slice(0, 6000)), z.string().optional()),
        items: z.preprocess((v) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 1000)) : undefined), z.array(z.string()).optional()),
      }),
    )
    .min(4)
    .max(200),
});

export const draftBlogWithAI = defineAction({
  input: z.object({
    topic: z.string().trim().min(3, "Say what the post is about").max(160),
    audience: z.enum(["home buyers", "investors", "sellers", "landlords", "overseas buyers"]).default("home buyers"),
    words: z.union([z.literal(600), z.literal(900), z.literal(1400)]).default(900),
    /** Several service pages (owner, 2026-11-25); the draft links each once. */
    servicePaths: z.array(z.string().regex(/^\/[a-z0-9-]+$/)).max(6).default([]),
    note: z.string().trim().max(1000).default(""),
  }),
  async handler(input, ctx) {
    const { runTask } = await import("@/server/ai/run-task");
    const { loadPrompt } = await import("@/server/ai/prompts");
    const prompt = loadPrompt("blog-draft.v2");
    const { data } = await runTask(aiDraft, {
      task: "blog-draft",
      model: "sonnet",
      output: "structured",
      effort: "medium",
      system: [{ text: prompt.text, cache: true }],
      messages: [
        {
          role: "user",
          content: [
            `Search or topic: ${input.topic}`,
            `Written for: ${input.audience}`,
            `Target length: about ${input.words} words`,
            `Service pages to link (each once, where it fits naturally): ${input.servicePaths.length ? input.servicePaths.join(", ") : "(none chosen: link the most relevant one service page you know of)"}`,
            `Esi's note: ${input.note || "(none)"}`,
          ].join("\n"),
        },
      ],
      maxTokens: 12000,
      tenantId: ctx.tenantId,
      entity: { type: "blog_post", id: ctx.tenantId },
      promptVersion: prompt.version,
    });
    let slug = slugify(input.topic);
    for (let n = 2; ; n++) {
      const [clash] = await ctx.tx.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
      if (!clash) break;
      slug = `${slugify(input.topic)}-${n}`;
    }
    const blocks = data.blocks.filter((b) => (b.t === "ul" ? (b.items ?? []).some(Boolean) : (b.text ?? "").trim()));
    const [p] = await ctx.tx
      .insert(blogPosts)
      .values({
        tenantId: ctx.tenantId,
        slug,
        title: data.title,
        seoTitle: data.seoTitle || null,
        description: data.description,
        targetSearch: input.topic,
        coverAlt: data.coverAlt,
        blocks,
        wordCount: words(blocks),
        status: "draft",
        aiGenerated: true,
      })
      .returning({ id: blogPosts.id });
    await ctx.audit({ kind: "edit", action: "Drafted a blog post with AI", target: data.title, entityType: "blog_post", entityId: p.id });
    revalidatePath("/seo/blog");
    return { id: p.id };
  },
});

/**
 * ✦ Suggest / ✦ Fix in the editor (owner, 2026-11-25): on request only, the fast model
 * (about A$0.01 each), shown to the owner to accept or dismiss; it never saves anything
 * itself. Field tasks return one value; "edit" tasks return the blocks to change or add.
 */
const suggestOut = z.object({
  value: z.preprocess((v) => (v == null ? undefined : String(v).trim().slice(0, 2000)), z.string().optional()),
  changes: z
    .array(z.object({ index: z.number().int().min(0), block }))
    .max(40)
    .optional(),
  inserts: z
    .array(z.object({ after: z.number().int().min(-1), block }))
    .max(20)
    .optional(),
  note: z.preprocess((v) => (v == null ? undefined : String(v).slice(0, 300)), z.string().optional()),
  /** Several candidates (description, titles): the code picks one that meets the rule, by counting. */
  options: z.preprocess((v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : undefined), z.array(z.string()).optional()),
}).passthrough();

export const suggestForPost = defineAction({
  input: z.object({
    id: z.string().uuid(),
    task: z.enum(["title", "seoTitle", "description", "targetSearch", "coverAlt", "firstParagraph", "edit"]),
    /** For "edit": what to do, e.g. "Add a link to /buyer-agent-adelaide where it fits". */
    instruction: z.string().trim().max(8000).default(""),
    post: z.object({
      title: z.string().max(200),
      targetSearch: z.string().max(200),
      description: z.string().max(300),
      blocks: z.array(block).max(400),
    }),
  }),
  async handler(input, ctx) {
    const { runTask } = await import("@/server/ai/run-task");
    const { loadPrompt } = await import("@/server/ai/prompts");
    const prompt = loadPrompt("blog-suggest.v3");
    /**
     * The standards the checklist uses, checked here too (owner, 2026-11-25: an 83-character
     * description came back for a 120-160 rule). One retry tells the model what was wrong.
     */
    const LIMITS: Partial<Record<typeof input.task, [number, number]>> = {
      title: [20, 70],
      seoTitle: [20, 60],
      description: [120, 160],
      targetSearch: [6, 80],
      coverAlt: [10, 160],
    };
    let feedback = "";
    for (let attempt = 0; ; attempt++) {
      const { data } = await runTask(suggestOut, {
        task: `blog-suggest:${input.task}`,
        // Length-bound text (description, titles) goes to the writing model at low effort:
        // the fast model kept writing ~110-character descriptions (owner, 2026-11-25).
        model: ["description", "title", "seoTitle"].includes(input.task) ? "sonnet" : "haiku",
        effort: "low",
        output: "structured",
        system: [{ text: prompt.text, cache: true }],
        messages: [
          {
            role: "user",
            content: [
              `TASK: ${input.task}${input.instruction ? ` - ${input.instruction}` : ""}`,
              feedback,
              "",
              `Title: ${input.post.title}`,
              `Target search: ${input.post.targetSearch || "(not set)"}`,
              `SEO description: ${input.post.description || "(empty)"}`,
              "Blocks:",
              JSON.stringify(input.post.blocks.map((b, i) => ({ i, ...b }))).slice(0, 40000),
            ].join("\n"),
          },
        ],
        maxTokens: 6000,
        tenantId: ctx.tenantId,
        entity: { type: "blog_post", id: input.id },
        promptVersion: prompt.version,
      });
      /**
       * The model sometimes names the field after the task ({"seoTitle": "..."}) instead of
       * "value" (2026-11-25: suggestions came back empty). Accept the first text it gave.
       */
      const extra = data as Record<string, unknown>;
      // Exact counting in code (owner, 2026-11-25): the model writes several lengths, the
      // first that meets the rule (and contains the target search where required) wins.
      const lim0 = LIMITS[input.task];
      const tgt = input.post.targetSearch.trim().toLowerCase();
      const fits = (v: string) =>
        (!lim0 || (v.length >= lim0[0] && v.length <= lim0[1])) &&
        (!tgt || !["title", "seoTitle"].includes(input.task) || v.toLowerCase().includes(tgt));
      const picked = data.options?.length
        ? (data.options.filter(fits).sort((a, b) => Math.abs(a.length - (lim0 ? (lim0[0] + lim0[1]) / 2 : 0)) - Math.abs(b.length - (lim0 ? (lim0[0] + lim0[1]) / 2 : 0)))[0] ??
          [...data.options].sort((a, b) => b.length - a.length).find((v) => !lim0 || v.length <= lim0[1]) ??
          data.options[0])
        : undefined;
      const value = (picked ??
        data.value ??
        (typeof extra[input.task] === "string" ? (extra[input.task] as string) : undefined) ??
        (Object.entries(extra).find(([k, v]) => !["note", "changes", "inserts"].includes(k) && typeof v === "string")?.[1] as string | undefined)
      )?.trim();
      if (input.task === "edit") return { value: undefined, changes: data.changes, inserts: data.inserts, note: data.note };
      const lim = LIMITS[input.task];
      const target = input.post.targetSearch.trim().toLowerCase();
      const problems: string[] = [];
      if (!value) problems.push("you gave no value");
      else {
        if (lim && (value.length < lim[0] || value.length > lim[1])) problems.push(`it is ${value.length} characters and must be ${lim[0]}-${lim[1]}`);
        if (target && ["title", "seoTitle", "firstParagraph"].includes(input.task) && !value.toLowerCase().includes(target))
          problems.push(`it must contain the exact target search "${target}"`);
      }
      if (!problems.length) return { value, changes: undefined, inserts: undefined, note: data.note };
      if (attempt >= 1) {
        if (value) return { value, changes: undefined, inserts: undefined, note: `Check: ${problems.join("; ")}.` };
        throw new ActionError("The AI gave no suggestion. Press Try another.");
      }
      feedback = `YOUR LAST ANSWER WAS WRONG: ${problems.join("; ")}. Answer again following the rules exactly.`;
    }
  },
});
