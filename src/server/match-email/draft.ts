import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  approvalItems,
  campaignRecipients,
  campaigns,
  contacts,
  matches,
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

    const facts = await draftFacts(tx, r.contactId, r.propertyId);
    return { r, gate, person, brief, ...facts };
  });
  if (!ctx || !ctx.profile || (ctx.r.propertyId && !ctx.property)) return { skipped: true };
  const { r, gate, person, brief } = ctx;

  const request = draftRequest({ firstName: person.firstName, ...ctx, profile: ctx.profile, brief });
  const prompt = loadPrompt(brief ? COMPOSE_PROMPT : "match-email.v4");
  try {
    const { data, generationId } = await runTask(draftSchema, {
      task: brief ? "campaign-email" : "match-email",
      model: "sonnet",
      output: "structured",
      system: [{ text: prompt.text, cache: true }],
      messages: [{ role: "user", content: request }],
      maxTokens: 2000,
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
          card: data.card,
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
export const COMPOSE_PROMPT = "campaign-email.v1";
export const TONES = ["warm", "short", "investor"] as const;
export type ComposeBrief = { tone: (typeof TONES)[number]; note: string };
export function composeBrief(segment: unknown): ComposeBrief | null {
  if (!segment || typeof segment !== "object" || (segment as { kind?: unknown }).kind !== "compose") return null;
  const s = segment as { tone?: unknown; note?: unknown };
  const tone = TONES.includes(s.tone as ComposeBrief["tone"]) ? (s.tone as ComposeBrief["tone"]) : "warm";
  return { tone, note: typeof s.note === "string" ? s.note.slice(0, 1500) : "" };
}

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/** What the model reads about the person and (when there is one) the property. */
export async function draftFacts(tx: Tx, contactId: string, propertyId: string | null) {
  const [match] = propertyId
    ? await tx
        .select({ score: matches.score, reason: matches.reason })
        .from(matches)
        .where(and(eq(matches.propertyId, propertyId), eq(matches.contactId, contactId)))
        .limit(1)
    : [];
  const [profile] = await clientProfiles(tx, [contactId], { enquiries: 6, enquiryChars: 700 });
  const property = propertyId ? await propertyProfile(tx, propertyId) : null;
  return { match, profile, property };
}

export function draftRequest(o: {
  firstName: string | null;
  profile: { text: string };
  match?: { score: number; reason: string } | null;
  property: { text: string } | null;
  brief: ComposeBrief | null;
}) {
  return [
    o.brief ? `ESI'S BRIEF (tone: ${o.brief.tone})\n${o.brief.note || "(no brief: write about the property)"}\n` : null,
    "THE CLIENT",
    `First name: ${o.firstName || "there"}`,
    o.profile.text,
    o.match ? `\nWhy they were picked (fit ${o.match.score.toFixed(2)}): ${o.match.reason}` : null,
    "",
    o.property ? "THE PROPERTY" : "THERE IS NO PROPERTY: this is a general message, so card must be null.",
    o.property ? o.property.text : null,
  ]
    .filter((x) => x !== null)
    .join("\n");
}

export { draftSchema };
