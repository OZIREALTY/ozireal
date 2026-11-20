import Link from "next/link";
import { PageHeader, Section, Empty } from "@/components/ui";
import { getCampaigns } from "@/server/queries";
import { composeData } from "@/server/queries/compose";
import { relative } from "@/lib/utils";
import { CampaignActions } from "@/components/forms/content-forms";
import { Composer } from "@/components/campaigns/composer";
import { CampaignTabs } from "@/components/campaigns/tabs";

export const dynamic = "force-dynamic";

/**
 * Campaigns (redesigned 2026-11-20, owner-approved preview): the job here is writing one
 * email and choosing who gets it. The composer does that in four steps; below it, every
 * email batch as a card with where it is. Every draft goes to "Waiting for my OK".
 */

const status: Record<string, { label: string; cls: string; stage: number }> = {
  draft: { label: "Being written", cls: "surface-2 text-2", stage: 1 },
  in_approval: { label: "Waiting for my OK", cls: "bg-[#fff3d1] text-[#9a6a00] dark:bg-[#3a3016] dark:text-[#f0c14b]", stage: 2 },
  sending: { label: "Sending", cls: "bg-[var(--accent)]/10 text-[var(--accent)]", stage: 2 },
  sent: { label: "Sent", cls: "bg-[#e3f4ea] text-[#1f7a4d] dark:bg-[#173527] dark:text-[#5fd39a]", stage: 3 },
  cancelled: { label: "Cancelled", cls: "surface-2 text-2", stage: 0 },
};

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const [{ new: startNew }, campaigns, data] = await Promise.all([searchParams, getCampaigns(), composeData()]);

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Write one email, choose who gets it, and approve it. AI writes a personal draft for each person. Nothing goes out until you press send in Waiting for my OK."
      />
      <CampaignTabs active="write" />

      <div className="mb-8">
        <Composer data={data} startOpen={startNew === "1" || campaigns.length === 0} />
      </div>

      <Section title="Your emails">
        {campaigns.length === 0 ? (
          <Empty>No emails yet. Press New email to write the first one.</Empty>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {campaigns.map((c) => {
              const s = status[c.status] ?? status.draft;
              const waiting = c.recipients - c.approved - c.blocked;
              return (
                <div key={c.id} className="surface border rounded-2xl p-4 flex flex-col gap-2.5 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${s.cls}`}>{s.label}</span>
                    <span className="text-[12.5px] text-2 uppercase font-semibold">{c.channel}</span>
                  </div>
                  <Link href={`/campaigns/${c.id}`} className="text-[15.5px] font-bold leading-snug hover:underline underline-offset-2">
                    {c.name.replace(/^Matched buyers: /, "")}
                  </Link>
                  {c.listingId && c.address && (
                    <Link href={`/listings/${c.listingId}`} className="text-[13px] text-2 hover:underline underline-offset-2 -mt-1.5">
                      {c.address}
                    </Link>
                  )}
                  <div className="flex gap-1" aria-hidden>
                    {[1, 2, 3].map((i) => (
                      <i key={i} className={`flex-1 h-[5px] rounded ${s.stage >= i ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-2">
                    <span>{c.recipients} {c.recipients === 1 ? "person" : "people"}</span>
                    {c.approved > 0 && <span>{c.approved} sent</span>}
                    {waiting > 0 && c.status !== "sent" && c.status !== "cancelled" && <span>{waiting} waiting</span>}
                    {c.blocked > 0 && <span className="text-[#b02f2f] dark:text-[#f08a8a]">{c.blocked} skipped</span>}
                    {c.opened > 0 && <span>{c.opened} opened</span>}
                    {c.replied > 0 && <span>{c.replied} replied</span>}
                    <span>{relative(c.createdAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-1">
                    {c.status === "in_approval" && (
                      <Link href="/approvals" className="rounded-lg bg-[var(--accent)] text-white text-[13px] font-bold px-3 min-h-8 inline-flex items-center">
                        Review and approve
                      </Link>
                    )}
                    <Link href={`/campaigns/${c.id}`} className="rounded-lg border text-[13px] font-bold px-3 min-h-8 inline-flex items-center hover:bg-[var(--surface)]">
                      Who opened, who replied
                    </Link>
                    <CampaignActions campaign={{ id: c.id, name: c.name, channel: c.channel, status: c.status, listingId: c.listingId }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

    </>
  );
}
