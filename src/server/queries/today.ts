import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { query } from "@/db";
import { approvalItems, calendarEvents, campaigns, contacts, interactions, tasks } from "@/db/schema";

/**
 * The mobile Today screen (owner's request, 2026-11-19): what needs the agent now, from
 * live rows. Next appointment, four counts, and one "do now" list: new enquiries, emails
 * waiting for approval (per batch), and tasks overdue or due today.
 */

export type TodayEnquiry = { kind: "enquiry"; id: string; contactId: string; name: string; phone: string | null; subject: string; at: Date };
export type TodayBatch = { kind: "emails"; campaignId: string; propertyId: string | null; name: string; count: number };
export type TodayTask = { kind: "task"; id: string; title: string; dueAt: Date | null; overdue: boolean; contactId: string | null; name: string | null; phone: string | null };

export async function getToday() {
  // Adelaide day boundaries, computed in the database so DST is right.
  return query(async (tx) => {
    const [bounds] = await tx.execute<{ start: Date; end: Date }>(sql`
      select (date_trunc('day', now() at time zone 'Australia/Adelaide') at time zone 'Australia/Adelaide') as start,
             ((date_trunc('day', now() at time zone 'Australia/Adelaide') + interval '1 day') at time zone 'Australia/Adelaide') as end`);
    const end = new Date(bounds.end);

    const [next] = await tx
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startsAt: calendarEvents.startsAt,
        contactId: calendarEvents.contactId,
        name: sql<string | null>`(select c.first_name || ' ' || c.last_name from contacts c where c.id = ${calendarEvents.contactId})`,
        phone: sql<string | null>`(select c.phone_raw from contacts c where c.id = ${calendarEvents.contactId})`,
      })
      .from(calendarEvents)
      .where(and(gte(calendarEvents.startsAt, sql`now() - interval '30 minutes'`), lte(calendarEvents.startsAt, sql`now() + interval '2 days'`), sql`${calendarEvents.cancelledAt} is null`))
      .orderBy(asc(calendarEvents.startsAt))
      .limit(1)
      .catch(() => []);

    // New enquiries: inbound from forms, email, SMS, portals or social in the last 3 days.
    const enq = await tx
      .select({
        id: interactions.id,
        contactId: interactions.contactId,
        first: contacts.firstName,
        last: contacts.lastName,
        phone: contacts.phoneRaw,
        subject: interactions.subject,
        body: interactions.body,
        at: interactions.occurredAt,
      })
      .from(interactions)
      .innerJoin(contacts, eq(contacts.id, interactions.contactId))
      .where(
        and(
          eq(interactions.direction, "in"),
          inArray(interactions.channel, ["web_form", "email", "sms", "portal", "social"]),
          gte(interactions.occurredAt, sql`now() - interval '3 days'`),
          isNull(interactions.tombstonedAt),
          isNull(contacts.tombstonedAt),
        ),
      )
      .orderBy(desc(interactions.occurredAt))
      .limit(8);
    const seen = new Set<string>();
    const enquiries: TodayEnquiry[] = [];
    for (const e of enq) {
      if (seen.has(e.contactId)) continue;
      seen.add(e.contactId);
      const subject = (e.subject ?? "").replace(/^Website enquiry\s*[—-]\s*/i, "") || (e.body ?? "").slice(0, 90);
      enquiries.push({ kind: "enquiry", id: e.id, contactId: e.contactId, name: `${e.first} ${e.last}`.trim(), phone: e.phone, subject, at: e.at });
    }

    const batchesRaw = await tx
      .select({
        campaignId: approvalItems.campaignId,
        propertyId: campaigns.propertyId,
        name: campaigns.name,
        count: sql<number>`count(*)::int`,
      })
      .from(approvalItems)
      .leftJoin(campaigns, eq(campaigns.id, approvalItems.campaignId))
      .where(eq(approvalItems.status, "pending"))
      .groupBy(approvalItems.campaignId, campaigns.propertyId, campaigns.name);
    const batches: TodayBatch[] = batchesRaw.map((b) => ({
      kind: "emails",
      campaignId: b.campaignId ?? "single",
      propertyId: b.propertyId,
      name: (b.name ?? "Messages to approve").replace(/^Matched buyers:\s*/, ""),
      count: b.count,
    }));

    const due = await tx
      .select({
        id: tasks.id,
        title: tasks.title,
        dueAt: tasks.dueAt,
        contactId: tasks.contactId,
        name: sql<string | null>`(select c.first_name || ' ' || c.last_name from contacts c where c.id = ${tasks.contactId})`,
        phone: sql<string | null>`(select c.phone_raw from contacts c where c.id = ${tasks.contactId})`,
      })
      .from(tasks)
      .where(and(eq(tasks.status, "open"), lte(tasks.dueAt, end)))
      .orderBy(asc(tasks.dueAt))
      .limit(30);
    const now = Date.now();
    const start = new Date(bounds.start).getTime();
    const taskItems: TodayTask[] = due.map((t) => ({
      kind: "task",
      ...t,
      overdue: !!t.dueAt && t.dueAt.getTime() < start,
    }));
    void now;

    const pendingEmails = batches.reduce((n, b) => n + b.count, 0);
    return {
      next: next ?? null,
      counts: {
        enquiries: enquiries.length,
        emails: pendingEmails,
        overdue: taskItems.filter((t) => t.overdue).length,
        today: taskItems.filter((t) => !t.overdue).length,
      },
      items: [...enquiries, ...batches, ...taskItems.filter((t) => t.overdue), ...taskItems.filter((t) => !t.overdue)] as (TodayEnquiry | TodayBatch | TodayTask)[],
    };
  });
}
