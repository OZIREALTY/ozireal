import { PageHeader } from "@/components/ui";
import { currentTenantId } from "@/db";
import { getGmailCheck } from "@/server/queries/gmail-contacts";
import { GmailCheck } from "@/components/contacts/gmail-check";

export const dynamic = "force-dynamic";

/** Contacts → Gmail check (owner-approved preview, 2026-11-27). */
export default async function GmailCheckPage() {
  const tenantId = await currentTenantId();
  const data = await getGmailCheck(tenantId);
  return (
    <>
      <PageHeader title="Gmail contacts check" subtitle="Your Google Contacts compared with the CRM, every second Monday and whenever you press Refresh. Nothing is added until you tick it." />
      <GmailCheck
        connected={data.connected}
        running={data.running ? { step: data.running.step } : null}
        lastRun={data.lastRun ? { status: data.lastRun.status, trigger: data.lastRun.trigger, at: data.lastRun.finishedAt ?? data.lastRun.startedAt, error: data.lastRun.error } : null}
        lastDone={data.lastDone ? { at: data.lastDone.finishedAt ?? data.lastDone.startedAt, trigger: data.lastDone.trigger, totals: data.lastDone.totals } : null}
        items={data.items}
      />
    </>
  );
}
