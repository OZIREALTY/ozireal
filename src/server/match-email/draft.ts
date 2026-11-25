import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  approvalItems,
  campaignRecipients,
  campaigns,
  contacts,
  listings,
  matches,
  type EmailCard,
} from "@/db/schema";
import { checkConsent } from "@/server/outbound/gate";
import { runTask, TaskOutputError } from "@/server/ai/run-task";
import { ClaudeError } from "@/server/ai/claude";
import { loadPrompt } from "@/server/ai/prompts";
import { clientProfiles, propertyProfile } from "@/server/audience/profile";
import { emailCardSchema } from "./card";

/**
 * Draft one matched-buyer email (2026-11-12): the job DraftMatchEmail, one per
 * campaign_recipients row.
 *
 * Reads the person (their wants, their brief, why they matched) and the property (only
 * its public facts and the agent's own price wording), asks the model for a personal
 * email, validates it (runTask + Zod, §9), and files it in the approval queue. Nothing is
 * sent here: the agent approves, and consent is checked again at the send (rules 1, 2).
 *
 * Idempotent: a recipient that already has a draft is skipped.
 */

const draftSchema = z.object({
  subject: z.preprocess((v) => String(v ?? "").slice(0, 120), z.string().min(3)),
  body: z.preprocess((v) => String(v ?? "").slice(0, 3000), z.string().min(20)),
  reviewNote: z.preprocess((v) => (v == null || v === "" ? null : String(v).slice(0, 200)), z.string().nullable()),
  card: emailCardSchema,
  /** Several properties (2026-11-24): one card per property, in the order given. */
  cards: z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(emailCardSchema)).default([]),
});

export async function draftMatchEmail(tenantId: string, recipientId: string) {
  const ctx = await withTenant(tenantId, async (tx) => {
    const [r] = await tx
      .select({
        id: campaignRecipients.id,
        contactId: campaignRecipients.contactId,
        approvalItemId: campaignRecipients.approvalItemId,
        campaignId: campaigns.id,
        propertyId: campaigns.propertyId,
        listingId: campaigns.listingId,
        campaignStatus: campaigns.status,
        segment: campaigns.segment,
      })
      .from(campaignRecipients)
      .innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
      .where(eq(campaignRecipients.id, recipientId))
      .limit(1);
    if (!r || r.approvalItemId || r.campaignStatus === "cancelled") return null;
    const brief = composeBrief(r.segment);
    // A matched-buyer email is always about a property; a composed one may be general.
    if (!r.propertyId && !brief) return null;

    const gate = await checkConsent(tx, r.contactId, "email");
    if (!gate.allowed) {
      await tx.update(campaignRecipients).set({ blockedReason: gate.reason }).where(eq(campaignRecipients.id, r.id));
      return null;
    }

    const [person] = await tx
      .select({ firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.emailRaw })
      .from(contacts)
      .where(eq(contacts.id, r.contactId))
      .limit(1);
    if (!person?.email) {
      await tx.update(campaignRecipients).set({ blockedReason: "No email address on file." }).where(eq(campaignRecipients.id, r.id));
      return null;
    }

    const extra = await extraHomes(tx, brief?.listingIds ?? [], r.listingId);
    const facts = await draftFacts(tx, r.contactId, r.propertyId, extra.map((e) => e.propertyId));
    return { r, gate, person, brief, extra, ...facts };
  });
  if (!ctx || !ctx.profile || (ctx.r.propertyId && !ctx.property)) return { skipped: true };
  const { r, gate, person, brief, extra } = ctx;

  const request = draftRequest({ firstName: person.firstName, ...ctx, profile: ctx.profile, brief });
  const prompt = loadPrompt(brief ? COMPOSE_PROMPT : "match-email.v4");
  try {
    const { data, generationId } = await runTask(draftSchema, {
      task: brief ? "campaign-email" : "match-email",
      model: "sonnet",
      output: "structured",
      system: [{ text: prompt.text, cache: true }],
      messages: [{ role: "user", content: request }],
      maxTokens: 8000,
      effort: "low",
      tenantId,
      entity: { type: "campaign_recipient", id: r.id },
      promptVersion: prompt.version,
    });

    await withTenant(tenantId, async (tx) => {
      // Re-check idempotency inside the write: two runs must not file two drafts.
      const [now] = await tx
        .select({ a: campaignRecipients.approvalItemId })
        .from(campaignRecipients)
        .where(eq(campaignRecipients.id, r.id))
        .for("update");
      if (now?.a) return;
      const [item] = await tx
        .insert(approvalItems)
        .values({
          tenantId,
          kind: "email",
          status: "pending",
          contactId: r.contactId,
          listingId: r.listingId,
          campaignId: r.campaignId,
          draftSubject: data.subject,
          draftBody: data.body,
          reviewNote: data.reviewNote,
          card: cardsFor(data, extra.map((e) => e.listingId)),
          consentAtDraft: gate.consentStatus,
          consentCheckedAt: new Date(),
          aiGenerationId: generationId,
          model: "sonnet",
        })
        .returning({ id: approvalItems.id });
      await tx.update(campaignRecipients).set({ approvalItemId: item.id }).where(eq(campaignRecipients.id, r.id));
      await tx
        .update(campaigns)
        .set({ status: "in_approval" })
        .where(and(eq(campaigns.id, r.campaignId), inArray(campaigns.status, ["draft"])));
    });
    return { drafted: true };
  } catch (e) {
    if (e instanceof ClaudeError && e.retryable) throw e;
    const reason =
      e instanceof TaskOutputError ? "The AI's draft could not be read. Try drafting again." : `Drafting failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}`;
    await withTenant(tenantId, (tx) =>
      tx.update(campaignRecipients).set({ blockedReason: reason }).where(eq(campaignRecipients.id, r.id)),
    );
    return { failed: true };
  }
}

/** The composer's brief (Campaigns, 2026-11-20): what the email is about, and its tone. */
export const COMPOSE_PROMPT = "campaign-email.v2";
export const TONES = ["warm", "short", "investor"] as const;
export type ComposeBrief = { tone: (typeof TONES)[number]; note: string; listingIds: string[] };
export function composeBrief(segment: unknown): ComposeBrief | null {
  if (!segment || typeof segment !== "object" || (segment as { kind?: unknown }).kind !== "compose") return null;
  const s = segment as { tone?: unknown; note?: unknown; listingIds?: unknown };
  const tone = TONES.includes(s.tone as ComposeBrief["tone"]) ? (s.tone as ComposeBrief["tone"]) : "warm";
  const listingIds = Array.isArray(s.listingIds) ? s.listingIds.filter((x): x is string => typeof x === "string").slice(0, MAX_HOMES) : [];
  return { tone, note: typeof s.note === "string" ? s.note.slice(0, 1500) : "", listingIds };
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/** What the model reads about the person and (when there is one) the property. */
export async function draftFacts(tx: Tx, contactId: string, propertyId: string | null, extraPropertyIds: string[] = []) {
  const [match] = propertyId
    ? await tx
        .select({ score: matches.score, reason: matches.reason })
        .from(matches)
        .where(and(eq(matches.propertyId, propertyId), eq(matches.contactId, contactId)))
        .limit(1)
    : [];
  const [profile] = await clientProfiles(tx, [contactId], { enquiries: 6, enquiryChars: 700 });
  const property = propertyId ? await propertyProfile(tx, propertyId) : null;
  const others: { text: string }[] = [];
  for (const id of extraPropertyIds) {
    const p = await propertyProfile(tx, id);
    if (p) others.push(p);
  }
  return { match, profile, property, others };
}

/** At most this many properties in one email (owner, 2026-11-24). */
export const MAX_HOMES = 5;

/** The listings after the first, with their properties, in the order chosen. Gone ones are skipped. */
export async function extraHomes(tx: Tx, listingIds: string[], first: string | null) {
  const ids = listingIds.filter((id) => id !== first);
  if (!ids.length) return [];
  const rows = await tx
    .select({ listingId: listings.id, propertyId: listings.propertyId })
    .from(listings)
    .where(inArray(listings.id, ids));
  return ids.map((id) => rows.find((r) => r.listingId === id)).filter((r): r is { listingId: string; propertyId: string } => !!r);
}

/** The stored card: the first property's card, with the rest under more. */
export function cardsFor(data: z.infer<typeof draftSchema>, extraListingIds: string[]): EmailCard | null {
  if (!extraListingIds.length) return data.card ?? data.cards[0] ?? null;
  const cards = data.cards.length ? data.cards : data.card ? [data.card] : [];
  const first = cards[0] ?? { title: "", urgency: null, advantages: [] };
  const more = extraListingIds.map((listingId, i) => {
    const c = cards[i + 1] ?? { title: "", urgency: null, advantages: [] };
    return { listingId, title: c.title, urgency: c.urgency, advantages: c.advantages };
  });
  return { ...first, more };
}

export function draftRequest(o: {
  firstName: string | null;
  profile: { text: string };
  match?: { score: number; reason: string } | null;
  property: { text: string } | null;
  others?: { text: string }[];
  brief: ComposeBrief | null;
}) {
  const several = !!o.property && !!o.others?.length;
  return [
    o.brief ? `ESI'S BRIEF (tone: ${o.brief.tone})\n${o.brief.note || "(no brief: write about the property)"}\n` : null,
    "THE CLIENT",
    `First name: ${o.firstName || "there"}`,
    o.profile.text,
    o.match ? `\nWhy they were picked (fit ${o.match.score.toFixed(2)}): ${o.match.reason}` : null,
    "",
    several
      ? `THERE ARE ${1 + o.others!.length} PROPERTIES: write about each of them, in this order, and return "cards" (one per property, same order) with "card" null.`
      : o.property ? "THE PROPERTY" : "THERE IS NO PROPERTY: this is a general message, so card must be null.",
    several
      ? [o.property!, ...o.others!].map((p, i) => `PROPERTY ${i + 1}\n${p.text}`).join("\n\n")
      : o.property ? o.property.text : null,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

export { draftSchema };
