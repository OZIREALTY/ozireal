import { desc, eq, sql } from "drizzle-orm";
import { query } from "@/db";
import { contacts, gmailContactItems, gmailContactRuns } from "@/db/schema";

/** What the Gmail contacts check page and the home card show (2026-11-27). */
export async function getGmailCheck(tenantId: string) {
  const { getSecret } = await import("@/server/secrets");
  const connected = !!(await getSecret(tenantId, "GOOGLE_CONTACTS_REFRESH_TOKEN"));
  return query(async (tx) => {
    const runs = await tx.select().from(gmailContactRuns).orderBy(desc(gmailContactRuns.startedAt)).limit(5);
    const items = await tx
      .select({
        id: gmailContactItems.id,
        kind: gmailContactItems.kind,
        status: gmailContactItems.status,
        name: gmailContactItems.name,
        emails: gmailContactItems.emails,
        phones: gmailContactItems.phones,
        extra: gmailContactItems.extra,
        suggestedRole: gmailContactItems.suggestedRole,
        roleReason: gmailContactItems.roleReason,
        crmContactId: gmailContactItems.crmContactId,
        crmName: sql<string | null>`${contacts.firstName} || ' ' || ${contacts.lastName}`,
        crmEmail: contacts.emailRaw,
        crmPhone: contacts.phoneRaw,
      })
      .from(gmailContactItems)
      .leftJoin(contacts, eq(contacts.id, gmailContactItems.crmContactId))
      .where(sql`${gmailContactItems.status} in ('open', 'skipped')`)
      .orderBy(gmailContactItems.name);
    const lastDone = runs.find((r) => r.status === "done") ?? null;
    return { connected, running: runs[0]?.status === "running" ? runs[0] : null, lastRun: runs[0] ?? null, lastDone, items };
  });
}

/** Counts for the home card: open findings only. */
export async function gmailCheckCounts() {
  return query(async (tx) => {
    const rows = await tx
      .select({ kind: gmailContactItems.kind, n: sql<number>`count(*)::int` })
      .from(gmailContactItems)
      .where(eq(gmailContactItems.status, "open"))
      .groupBy(gmailContactItems.kind);
    const get = (k: string) => rows.find((r) => r.kind === k)?.n ?? 0;
    return { new: get("new"), duplicate: get("duplicate"), extra: get("extra") };
  });
}
