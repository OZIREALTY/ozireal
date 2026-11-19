"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "./action";
import { knowledgeDocs } from "@/db/schema";
import { embedDocument, extractText, forgetTraining, storeDocument } from "@/server/knowledge";

/**
 * Train the AI (Settings → AI training, 2026-11-19): a file (PDF, Word, text), pasted
 * text, or a web link, on either shelf. Saved at once and searchable by its words;
 * the meaning index is built just after, and a failure there never loses the document.
 */

/** 5 MB of file is ~6.7 MB base64; next.config allows 8 MB action bodies. */
const MAX_BASE64 = 7_000_000;

const legalMeta = {
  jurisdiction: z.string().trim().max(10).optional(),
  instrument: z.string().trim().max(200).optional(),
  versionDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
};

export const addKnowledge = defineAction({
  input: z.object({
    shelf: z.enum(["rules", "office", "legal"]),
    title: z.string().trim().max(200).optional(),
    from: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("file"),
        name: z.string().trim().min(1).max(200),
        kind: z.enum(["pdf", "docx", "text"]),
        base64: z.string().min(1, "The file is empty.").max(MAX_BASE64, "That file is too large (5 MB at most)."),
      }),
      z.object({ type: z.literal("paste"), text: z.string().trim().min(20, "Paste a little more text.").max(400_000) }),
      z.object({ type: z.literal("link"), url: z.string().trim().url("That is not a web address.").max(2000) }),
    ]),
    ...legalMeta,
  }),
  async handler(input, ctx) {
    let text = "";
    let title = input.title || "";
    let sourceRef: string | null = null;
    const from = input.from;

    if (from.type === "file") {
      try {
        text = await extractText({ name: from.name, kind: from.kind, base64: from.base64 });
      } catch {
        throw new ActionError("That file could not be read. If it is a scanned PDF, paste its text instead.");
      }
      title ||= from.name.replace(/\.[a-z0-9]+$/i, "");
      sourceRef = from.name;
    } else if (from.type === "paste") {
      text = from.text;
      title ||= from.text.split("\n").find((l) => l.trim())?.trim().slice(0, 80) ?? "Pasted note";
    } else {
      const { fetchPage } = await import("@/server/web/fetch-page");
      try {
        const page = await fetchPage(from.url, 400_000);
        text = page.text;
        title ||= page.title ?? from.url;
      } catch (e) {
        throw new ActionError(e instanceof Error ? e.message : "That page could not be read.");
      }
      sourceRef = from.url;
    }

    if (text.replace(/\s/g, "").length < 20) {
      throw new ActionError("No readable text was found. If it is a scanned PDF, paste its text instead.");
    }

    let saved: { id: string; chunks: number };
    try {
      saved = await storeDocument(
        ctx.tx,
        ctx.tenantId,
        {
          shelf: input.shelf,
          title,
          source: from.type === "file" ? "upload" : from.type,
          sourceRef,
          jurisdiction: input.shelf === "legal" ? input.jurisdiction?.toUpperCase() || null : null,
          instrument: input.shelf === "legal" ? input.instrument || title : null,
          versionDate: input.shelf === "legal" ? input.versionDate || null : null,
          addedBy: ctx.userName,
        },
        text,
      );
    } catch (e) {
      throw new ActionError(e instanceof Error ? e.message : "The document could not be saved.");
    }

    await ctx.audit({
      kind: "edit",
      action: "knowledge.add",
      target: title,
      entityType: "knowledge_doc",
      entityId: saved.id,
      metadata: { shelf: input.shelf, chunks: saved.chunks },
    });
    ctx.afterCommit(() => embedDocument(ctx.tenantId, saved.id));
    ctx.afterCommit(async () => forgetTraining(ctx.tenantId));
    revalidatePath("/settings/knowledge");
    return { id: saved.id, title, chunks: saved.chunks };
  },
});

export const removeKnowledge = defineAction({
  input: z.object({ id: z.string().uuid() }),
  async handler(input, ctx) {
    const [row] = await ctx.tx
      .delete(knowledgeDocs)
      .where(and(eq(knowledgeDocs.id, input.id), eq(knowledgeDocs.tenantId, ctx.tenantId)))
      .returning({ title: knowledgeDocs.title });
    if (!row) throw new ActionError("That document is already gone.");
    await ctx.audit({ kind: "edit", action: "knowledge.remove", target: row.title, entityType: "knowledge_doc", entityId: input.id });
    ctx.afterCommit(async () => forgetTraining(ctx.tenantId));
    revalidatePath("/settings/knowledge");
  },
});
