"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { defineAction, ActionError } from "./action";
import { approvalItems, campaignRecipients, campaigns, contacts, listings, properties, suburbs, tenants } from "@/db/schema";
import { runTask } from "@/server/ai/run-task";
import { loadPrompt } from "@/server/ai/prompts";
import { checkConsent } from "@/server/outbound/gate";
import { emailPropertiesFor, propertyEmailHtml } from "@/server/outbound/property-email";
import { enqueue } from "@/server/jobs/queues";
import { emailCardSchema } from "@/server/match-email/card";
import { COMPOSE_PROMPT, MAX_HOMES, TONES, cardsFor, draftFacts, draftRequest, draftSchema, extraHomes } from "@/server/match-email/draft";

/**
 * The Campaigns composer (2026-11-20, owner-approved preview): one email, about a
 * property or general, to the people the agent chose. AI writes a personal draft per
 * person from the agent's brief; every draft lands in "Waiting for my OK"; the send gate
 * re-checks consent at the instant of each send (rules 1 and 2). No path to a send here.
 */

const brief = {
  listingId: z.union([z.string().uuid(), z.literal("")]).optional(),
  /** Several properties in one email (owner, 2026-11-24); the first is the lead one. */
  listingIds: z.array(z.string().uuid()).max(MAX_HOMES, `Up to ${MAX_HOMES} properties in one email`).default([]),
  tone: z.enum(TONES).default("warm"),
  note: z.string().trim().max(1500).default(""),
};

async function about(tx: Parameters<Parameters<typeof defineAction>[0]["handler"]>[1]["tx"], listingId?: string) {
  if (!listingId) return null;
  const [l] = await tx
    .select({
      listingId: listings.id,
      propertyId: listings.propertyId,
      label: sql<string>`trim(both ' ' from coalesce(${listings.projectName}, coalesce(${properties.streetNumber} || ' ', '') || coalesce(${properties.street}, ''))) || coalesce(', ' || ${suburbs.name}, '')`,
    })
    .from(listings)
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .leftJoin(suburbs, eq(suburbs.id, properties.suburbId))
    .where(eq(listings.id, listingId))
    .limit(1);
  if (!l) throw new ActionError("That listing no longer exists.");
  return l;
}

/** One sample draft for one person, rendered exactly as they would get it. Writes nothing but the AI log. */
export const previewComposeEmail = defineAction({
  input: z.object({ ...brief, contactId: z.string().uuid() }),
  async handler(input, ctx) {
    const ids = [...new Set(input.listingIds.length ? input.listingIds : input.listingId ? [input.listingId] : [])];
    const home = await about(ctx.tx, ids[0]);
    const extra = await extraHomes(ctx.tx, ids, home?.listingId ?? null);
    if (!home && !input.note) throw new ActionError("Say what the email is about, or pick a property.");
    const [person] = await ctx.tx
      .select({ firstName: contacts.firstName })
      .from(contacts)
      .where(eq(contacts.id, input.contactId))
      .limit(1);
    if (!person) throw new ActionError("That person is no longer in your contacts.");
    const facts = await draftFacts(ctx.tx, input.contactId, home?.propertyId ?? null, extra.map((e) => e.propertyId));
    if (!facts.profile) throw new ActionError("Nothing on file for that person yet.");
    const prompt = loadPrompt(COMPOSE_PROMPT);
    const { data } = await runTask(draftSchema, {
      task: "campaign-email-preview",
      model: "sonnet",
      output: "structured",
      system: [{ text: prompt.text, cache: true }],
      messages: [
        {
          role: "user",
          content: draftRequest({ firstName: person.firstName, ...facts, profile: facts.profile, brief: { tone: input.tone, note: input.note, listingIds: ids } }),
        },
      ],
      maxTokens: 8000,
      effort: "low",
      tenantId: ctx.tenantId,
      entity: { type: "contact", id: input.contactId },
      promptVersion: prompt.version,
    });
    const [t] = await ctx.tx.select({ name: tenants.name, licence: tenants.licenceNumber }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    const card = home ? cardsFor(data, extra.map((e) => e.listingId)) : null;
    const { property, more } = await emailPropertiesFor(ctx.tenantId, home?.listingId ?? null, card);
    const html = propertyEmailHtml({
      body: data.body,
      property,
      card,
      more,
      unsubscribeUrl: "https://www.ozirealty.com.au/unsubscribe",
      agencyLine: t?.licence ? `${t.name} · ${t.licence}` : (t?.name ?? ""),
    });
    return { subject: data.subject, reviewNote: data.reviewNote, html, draft: { subject: data.subject, body: data.body, reviewNote: data.reviewNote, card } };
  },
});

/** Create the campaign and queue one personal draft per person. */
export const startComposeEmail = defineAction({
  input: z.object({
    ...brief,
    name: z.string().trim().max(120).default(""),
    contactIds: z.array(z.string().uuid()).min(1, "Choose at least one person").max(300),
    /**
     * The sample the agent already read (owner, 2026-11-24): it becomes that person's
     * draft instead of being written twice. It still waits in the approval queue like
     * every other draft (rule 1), and consent is checked again at the send (rule 2).
     */
    sample: z
      .object({
        contactId: z.string().uuid(),
        subject: z.string().trim().min(3).max(120),
        body: z.string().trim().min(20).max(3000),
        reviewNote: z.string().max(200).nullable(),
        card: emailCardSchema,
      })
      .optional(),
  }),
  async handler(input, ctx) {
    const ids = [...new Set(input.listingIds.length ? input.listingIds : input.listingId ? [input.listingId] : [])];
    const home = await about(ctx.tx, ids[0]);
    const extra = await extraHomes(ctx.tx, ids, home?.listingId ?? null);
    if (!home && input.note.length < 10) throw new ActionError("Say what the email is about, or pick a property.");

    const okIds: string[] = [];
    const left: string[] = [];
    for (const id of [...new Set(input.contactIds)]) {
      const g = await checkConsent(ctx.tx, id, "email");
      (g.allowed ? okIds : left).push(id);
    }
    // No sending limit (owner, 2026-11-20: the once-a-week rule is removed).
    const held = new Set<string>();
    const go = okIds;
    if (!go.length) throw new ActionError("Nobody chosen can be emailed: no email consent, or no address.");

    const name = input.name || (home ? (extra.length ? `${home.label} + ${extra.length} more` : home.label) : input.note.split(/[.\n]/)[0].slice(0, 80)) || "Email";
    const [c] = await ctx.tx
      .insert(campaigns)
      .values({
        tenantId: ctx.tenantId,
        name,
        channel: "email",
        status: "draft",
        propertyId: home?.propertyId ?? null,
        listingId: home?.listingId ?? null,
        segment: { kind: "compose", tone: input.tone, note: input.note, contactIds: go, listingIds: ids },
        createdByUserId: ctx.userId,
      })
      .returning({ id: campaigns.id });
    const recipients = await ctx.tx
      .insert(campaignRecipients)
      .values(go.map((contactId) => ({ tenantId: ctx.tenantId, campaignId: c.id, contactId })))
      .returning({ id: campaignRecipients.id, contactId: campaignRecipients.contactId });

    const reuse = input.sample && go.includes(input.sample.contactId) ? input.sample : null;
    if (reuse) {
      const r = recipients.find((x) => x.contactId === reuse.contactId)!;
      const g = await checkConsent(ctx.tx, reuse.contactId, "email");
      const [item] = await ctx.tx
        .insert(approvalItems)
        .values({
          tenantId: ctx.tenantId,
          kind: "email",
          status: "pending",
          contactId: reuse.contactId,
          listingId: home?.listingId ?? null,
          campaignId: c.id,
          draftSubject: reuse.subject,
          draftBody: reuse.body,
          reviewNote: reuse.reviewNote,
          card: home ? reuse.card : null,
          consentAtDraft: g.consentStatus,
          consentCheckedAt: new Date(),
          model: "sonnet",
        })
        .returning({ id: approvalItems.id });
      await ctx.tx.update(campaignRecipients).set({ approvalItemId: item.id }).where(eq(campaignRecipients.id, r.id));
      await ctx.tx.update(campaigns).set({ status: "in_approval" }).where(eq(campaigns.id, c.id));
    }
    const toDraft = recipients.filter((x) => x.contactId !== reuse?.contactId);

    await ctx.audit({
      kind: "edit",
      action: `Started an email to ${go.length} ${go.length === 1 ? "person" : "people"}`,
      target: name,
      entityType: "campaign",
      entityId: c.id,
    });
    ctx.afterCommit(async () => {
      for (const r of toDraft) await enqueue("DraftMatchEmail", { tenantId: ctx.tenantId, entityId: r.id });
    });
    revalidatePath("/campaigns");
    revalidatePath("/approvals");
    return { campaignId: c.id, count: go.length, noConsent: left.length, held: held.size };
  },
});

/** Run the Gmail reply check now and say what happened (2026-11-20). */
export const checkRepliesNow = defineAction({
  input: z.object({}),
  async handler(_input, ctx) {
    const { checkRepliesFor } = await import("@/server/outbound/replies");
    const r = await checkRepliesFor(ctx.tenantId);
    revalidatePath("/campaigns/insights");
    return r;
  },
});
