import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { campaignDetail } from "@/server/queries/email-insights";
import { Review } from "@/components/campaigns/review";

export const dynamic = "force-dynamic";

/** Review and send one email batch (owner-approved preview, 2026-11-20). */
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await campaignDetail(id);
  if (!d) notFound();
  const name = d.campaign.name.replace(/^Matched buyers: /, "");
  return (
    <>
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-[13.5px] text-2 hover:underline mb-3">
        <ArrowLeft size={14} /> Campaigns
      </Link>
      <PageHeader
        title={name}
        subtitle="Review and send. Each person has their own email; consent is checked again as each one sends."
        actions={
          <Link href={`/campaigns/${id}`} className="rounded-xl border font-bold px-4 min-h-10 inline-flex items-center">
            Results
          </Link>
        }
      />
      <Review
        campaignName={name}
        rows={d.rows.map((r) => ({
          contactId: r.contactId,
          name: r.name,
          email: r.email,
          itemId: r.itemId,
          state: r.state,
          why: r.why,
          subject: r.subject,
          body: r.body,
          reviewNote: r.reviewNote,
        }))}
      />
    </>
  );
}
