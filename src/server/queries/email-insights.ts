import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { query } from "@/db";
import { approvalItems, campaignRecipients, campaigns, consents, contacts } from "@/db/schema";

/**
 * Email insights (owner-approved preview, 2026-11-20): every email the CRM sent, whatever
 * started it. One sent email = one approval_items row of kind email with status sent;
 * opens, clicks and replies are recorded on that row (0028).
 */

export type EmailType = "matched" | "property" | "general" | "campaign" | "single";
export const TYPE_LABEL: Record<EmailType, string> = {
  matched: "Matched buyers",
  property: "Property email",
  general: "General message",
  campaign: "Campaign",
  single: "Single email",
};

const typeSql = sql<EmailType>`case
  when ${campaigns.id} is null then 'single'
  when ${campaigns.segment}->>'kind' = 'matches' then 'matched'
  when ${campaigns.segment}->>'kind' = 'compose' and ${campaigns.propertyId} is not null then 'property'
  when ${campaigns.segment}->>'kind' = 'compose' then 'general'
  else 'campaign' end`;

type Row = {
  id: string;
  sentAt: Date;
  opened: boolean;
  opens: number;
  clicked: boolean;
  replied: boolean;
  type: EmailType;
  tone: string | null;
  campaignId: string | null;
  campaignName: string | null;
  contactId: string | null;
  name: string;
};

/**
 * "Got back to you" (owner, 2026-11-20: only numbers to trust): a reply to the email, or
 * any message from that person (email, form, logged call or visit) within 14 days of it.
 */
const respondedAt = sql<Date | null>`coalesce(${approvalItems.repliedAt}, (select min(i.occurred_at) from interactions i
  where i.contact_id = ${approvalItems.contactId} and i.direction = 'in'
    and i.occurred_at > ${approvalItems.sentAt} and i.occurred_at < ${approvalItems.sentAt} + interval '14 days'))`;

const rate = (n: number, d: number) => (d ? n / d : 0);

export async function emailInsights(days: number | null) {
  return query(async (tx) => {
    const now = Date.now();
    const from = days ? new Date(now - days * 864e5) : null;
    const prevFrom = days ? new Date(now - 2 * days * 864e5) : null;

    const rows: Row[] = (
      await tx
        .select({
          id: approvalItems.id,
          sentAt: approvalItems.sentAt,
          opened: sql<boolean>`${approvalItems.openedAt} is not null`,
          opens: approvalItems.openCount,
          clicked: sql<boolean>`${approvalItems.clickedAt} is not null`,
          replied: sql<boolean>`${respondedAt} is not null`,
          type: typeSql,
          tone: sql<string | null>`${campaigns.segment}->>'tone'`,
          campaignId: campaigns.id,
          campaignName: campaigns.name,
          contactId: approvalItems.contactId,
          name: sql<string>`trim(coalesce(${contacts.firstName},'') || ' ' || coalesce(${contacts.lastName},''))`,
        })
        .from(approvalItems)
        .leftJoin(campaigns, eq(campaigns.id, approvalItems.campaignId))
        .leftJoin(contacts, eq(contacts.id, approvalItems.contactId))
        .where(
          and(
            eq(approvalItems.kind, "email"),
            eq(approvalItems.status, "sent"),
            isNotNull(approvalItems.sentAt),
            prevFrom ? gte(approvalItems.sentAt, prevFrom) : undefined,
          ),
        )
        .orderBy(desc(approvalItems.sentAt))
    ).map((r) => ({ ...r, sentAt: r.sentAt as Date }));

    const cur = from ? rows.filter((r) => r.sentAt >= from) : rows;
    const prev = from ? rows.filter((r) => r.sentAt < from) : [];

    const unsub = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(consents)
      .where(and(eq(consents.channel, "email"), eq(consents.status, "revoked"), from ? gte(consents.occurredAt, from) : undefined));

    const totals = summarise(cur);
    const before = summarise(prev);

    // Weekly: sent and reply rate (last 8 weeks inside the window).
    const weeks = new Map<string, { week: string; sent: number; replied: number }>();
    for (const r of cur) {
      const d = new Date(r.sentAt);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const k = d.toISOString().slice(0, 10);
      const w = weeks.get(k) ?? { week: k, sent: 0, replied: 0 };
      w.sent++;
      if (r.replied) w.replied++;
      weeks.set(k, w);
    }
    const weekly = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-8);

    const byType = (Object.keys(TYPE_LABEL) as EmailType[])
      .map((t) => ({ type: t, label: TYPE_LABEL[t], ...summarise(cur.filter((r) => r.type === t)) }))
      .filter((t) => t.sent > 0);

    const batchMap = new Map<string, Row[]>();
    for (const r of cur) if (r.campaignId) batchMap.set(r.campaignId, [...(batchMap.get(r.campaignId) ?? []), r]);
    const batches = [...batchMap.entries()].map(([id, rs]) => ({
      id,
      name: (rs[0].campaignName ?? "Email").replace(/^Matched buyers: /, ""),
      type: rs[0].type,
      sentAt: rs.reduce((a, r) => (r.sentAt < a ? r.sentAt : a), rs[0].sentAt),
      ...summarise(rs),
    }));
    batches.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

    const quiet = cur
      .filter((r) => !r.replied && r.clicked)
      .sort((a, b) => Number(b.clicked) - Number(a.clicked) || b.opens - a.opens)
      .slice(0, 10);

    return {
      totals,
      before,
      unsubscribed: unsub[0]?.n ?? 0,
      weekly,
      byType,
      batches,
      quiet,
      notes: findings(cur, byType),
    };
  });
}

function summarise(rs: { opened: boolean; clicked: boolean; replied: boolean }[]) {
  const sent = rs.length;
  const opened = rs.filter((r) => r.opened).length;
  const clicked = rs.filter((r) => r.clicked).length;
  const replied = rs.filter((r) => r.replied).length;
  return { sent, opened, clicked, replied, openRate: rate(opened, sent), clickRate: rate(clicked, sent), replyRate: rate(replied, sent) };
}

/** Plain sentences from the numbers. Only claims with enough emails behind them. */
function findings(rs: Row[], byType: ({ label: string } & ReturnType<typeof summarise>)[]) {
  const out: string[] = [];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const typed = byType.filter((t) => t.sent >= 10).sort((a, b) => b.replyRate - a.replyRate);
  if (typed.length >= 2 && typed[0].replyRate > 0) {
    const lo = typed[typed.length - 1];
    out.push(`${typed[0].label} get the most replies: ${pct(typed[0].replyRate)}, against ${pct(lo.replyRate)} for ${lo.label.toLowerCase()}.`);
  }
  const tones = new Map<string, Row[]>();
  for (const r of rs) if (r.tone) tones.set(r.tone, [...(tones.get(r.tone) ?? []), r]);
  const toneName: Record<string, string> = { warm: "Warm", short: "Short and direct", investor: "Investor numbers" };
  const tr = [...tones.entries()].filter(([, v]) => v.length >= 10).map(([k, v]) => ({ k, r: summarise(v).replyRate })).sort((a, b) => b.r - a.r);
  if (tr.length >= 2) out.push(`The ${toneName[tr[0].k] ?? tr[0].k} tone gets the most replies (${pct(tr[0].r)}).`);
  const replies = rs.filter((r) => r.replied);
  if (replies.length >= 5) {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const byDay = new Map<number, { s: number; r: number }>();
    for (const r of rs) {
      const d = new Date(r.sentAt).getDay();
      const v = byDay.get(d) ?? { s: 0, r: 0 };
      v.s++;
      if (r.replied) v.r++;
      byDay.set(d, v);
    }
    const best = [...byDay.entries()].filter(([, v]) => v.s >= 5).sort((a, b) => b[1].r / b[1].s - a[1].r / a[1].s)[0];
    if (best) out.push(`Emails sent on a ${dayNames[best[0]]} get the most replies.`);
  }
  const keen = rs.filter((r) => !r.replied && r.clicked).length;
  if (keen) out.push(`${keen} ${keen === 1 ? "person" : "people"} clicked through to the listing but have not got back to you. Worth a call.`);
  if (!out.length) out.push(rs.length ? "Too few emails yet to compare. The findings appear as more go out." : "Nothing sent in this period.");
  return out;
}

/** One batch, person by person. */
export async function campaignDetail(id: string) {
  return query(async (tx) => {
    const [c] = await tx
      .select({ id: campaigns.id, name: campaigns.name, status: campaigns.status, type: typeSql, listingId: campaigns.listingId, createdAt: campaigns.createdAt, tone: sql<string | null>`${campaigns.segment}->>'tone'` })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1);
    if (!c) return null;
    const people = await tx
      .select({
        contactId: campaignRecipients.contactId,
        name: sql<string>`trim(coalesce(${contacts.firstName},'') || ' ' || coalesce(${contacts.lastName},''))`,
        email: contacts.emailRaw,
        blocked: campaignRecipients.blockedReason,
        itemId: approvalItems.id,
        itemStatus: approvalItems.status,
        blockReason: approvalItems.blockReason,
        sentAt: approvalItems.sentAt,
        openedAt: approvalItems.openedAt,
        opens: approvalItems.openCount,
        clickedAt: approvalItems.clickedAt,
        clicks: approvalItems.clickCount,
        repliedAt: respondedAt,
        reply: approvalItems.replySnippet,
        body: approvalItems.draftBody,
        reviewNote: approvalItems.reviewNote,
        subject: approvalItems.draftSubject,
      })
      .from(campaignRecipients)
      .innerJoin(contacts, eq(contacts.id, campaignRecipients.contactId))
      .leftJoin(approvalItems, eq(approvalItems.id, campaignRecipients.approvalItemId))
      .where(eq(campaignRecipients.campaignId, id))
      .orderBy(desc(respondedAt), desc(approvalItems.clickedAt), desc(approvalItems.openedAt), contacts.firstName);
    const rows = people.map((p) => {
      const state: "replied" | "clicked" | "opened" | "sent" | "waiting" | "writing" | "skipped" =
        p.repliedAt ? "replied"
        : p.clickedAt ? "clicked"
        : p.openedAt ? "opened"
        : p.itemStatus === "sent" ? "sent"
        : p.itemStatus === "pending" ? "waiting"
        : p.blocked || p.blockReason || p.itemStatus === "blocked" || p.itemStatus === "rejected" ? "skipped"
        : "writing";
      return { ...p, state, why: p.blocked ?? p.blockReason ?? (p.itemStatus === "rejected" ? "You removed it in Waiting for my OK." : null) };
    });
    const sent = rows.filter((r) => r.sentAt);
    return {
      campaign: c,
      rows,
      totals: {
        people: rows.length,
        skipped: rows.filter((r) => r.state === "skipped").length,
        waiting: rows.filter((r) => r.state === "waiting" || r.state === "writing").length,
        ...summarise(sent.map((r) => ({ opened: !!r.openedAt, clicked: !!r.clickedAt, replied: !!r.repliedAt }))),
      },
      firstSent: sent.reduce<Date | null>((a, r) => (!a || r.sentAt! < a ? r.sentAt! : a), null),
    };
  });
}
