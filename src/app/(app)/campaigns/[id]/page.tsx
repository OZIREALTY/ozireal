import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { campaignDetail, TYPE_LABEL } from "@/server/queries/email-insights";
import { currentTenantId } from "@/db";
import { checkRepliesFor, lastReplyCheck } from "@/server/outbound/replies";

export const dynamic = "force-dynamic";

/** One email batch, person by person (owner-approved preview, 2026-11-20). */
const STATE: Record<string, { label: string; cls: string }> = {
  replied: { label: "Got back to you", cls: "bg-[#e3f4ea] text-[#1f7a4d] dark:bg-[#173527] dark:text-[#5fd39a]" },
  clicked: { label: "Clicked", cls: "bg-[var(--accent)]/10 text-[var(--accent)]" },
  opened: { label: "Sent", cls: "bg-[var(--surface)] text-2" },
  sent: { label: "Sent", cls: "bg-[var(--surface)] text-2" },
  waiting: { label: "Waiting for OK", cls: "bg-[#fff3d1] text-[#9a6a00] dark:bg-[#3a3016] dark:text-[#f0c14b]" },
  writing: { label: "Being written", cls: "bg-[var(--surface)] text-2" },
  skipped: { label: "Skipped", cls: "bg-[#fde8e8] text-[#b02f2f] dark:bg-[#3a1c1c] dark:text-[#f08a8a]" },
};
const FILTERS = [
  { k: "all", label: "All" },
  { k: "replied", label: "Got back to you" },
  { k: "clicked", label: "Clicked" },
  { k: "waiting", label: "Waiting" },
  { k: "skipped", label: "Skipped" },
] as const;

const when = (d: Date | string | null) =>
  d ? new Date(d).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Adelaide" }) : "";

export default async function CampaignDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ show?: string }> }) {
  const { id } = await params;
  const { show = "all" } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Read new replies first (at most once a minute) so this page is current.
  const tenantId = await currentTenantId();
  const last = await lastReplyCheck(tenantId);
  if (!last || Date.now() - new Date(last.at).getTime() > 60_000) {
    await Promise.race([checkRepliesFor(tenantId), new Promise((res) => setTimeout(res, 15_000))]);
  }
  const d = await campaignDetail(id);
  if (!d) notFound();
  const { campaign: c, totals: t } = d;
  const pct = (n: number) => (t.sent ? `${Math.round((n / t.sent) * 100)}%` : "");

  const count = (k: string) =>
    k === "all" ? d.rows.length
    : k === "notopened" ? d.rows.filter((r) => r.state === "sent").length
    : k === "waiting" ? d.rows.filter((r) => r.state === "waiting" || r.state === "writing").length
    : k === "opened" ? d.rows.filter((r) => ["opened", "clicked", "replied"].includes(r.state)).length
    : k === "clicked" ? d.rows.filter((r) => r.clickedAt).length
    : d.rows.filter((r) => r.state === k).length;
  const rows = d.rows.filter((r) =>
    show === "all" ? true
    : show === "notopened" ? r.state === "sent"
    : show === "waiting" ? r.state === "waiting" || r.state === "writing"
    : show === "opened" ? ["opened", "clicked", "replied"].includes(r.state)
    : show === "clicked" ? !!r.clickedAt
    : r.state === show,
  );

  return (
    <>
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-[13.5px] text-2 hover:underline mb-3">
        <ArrowLeft size={14} /> Campaigns
      </Link>
      <PageHeader
        title={c.name.replace(/^Matched buyers: /, "")}
        subtitle={`${TYPE_LABEL[c.type]}${d.firstSent ? ` · first sent ${when(d.firstSent)}` : " · not sent yet"} · from admin@ozirealty.com.au`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        <Kpi label="People" value={t.people} note={t.skipped ? `${t.skipped} skipped` : t.waiting ? `${t.waiting} waiting` : undefined} />
        <Kpi label="Sent" value={t.sent} />
        <Kpi label="Clicked" value={t.clicked} note={pct(t.clicked)} />
        <Kpi label="Got back to you" value={t.replied} note={pct(t.replied)} star />
      </div>

      <h2 className="text-[13px] tracking-wider uppercase text-2 font-bold mt-7 mb-2.5">Person by person</h2>
      <div className="flex gap-1 surface-2 border rounded-xl p-1 w-max max-w-full overflow-x-auto mb-3">
        {FILTERS.map((f) => (
          <Link
            key={f.k}
            href={`/campaigns/${id}?show=${f.k}`}
            className={`rounded-lg px-3 min-h-9 inline-flex items-center whitespace-nowrap text-[13.5px] font-semibold ${f.k === show ? "bg-[var(--text)] text-[var(--surface-2)]" : "text-2"}`}
          >
            {f.label} {count(f.k)}
          </Link>
        ))}
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => {
          const s = STATE[r.state];
          const steps = [
            r.sentAt ? `Sent ${when(r.sentAt)}` : null,
            r.clickedAt ? "clicked the listing" : null,
            r.repliedAt ? `got back to you ${when(r.repliedAt)}` : null,
          ].filter(Boolean);
          return (
            <div key={r.contactId} className="surface-2 border rounded-xl px-4 py-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Link href={`/contacts/${r.contactId}`} className="font-bold hover:underline underline-offset-2">
                  {r.name || r.email || "Unnamed"}
                </Link>
                <small className="block text-2 text-[12.5px]">
                  {r.state === "skipped"
                    ? `Not sent: ${r.why ?? "blocked at the consent check"}`
                    : r.state === "waiting"
                      ? "In Waiting for my OK"
                      : r.state === "writing"
                        ? "The AI is writing this email"
                        : steps.join(" · ")}
                </small>
                {r.reply && <p className="mt-1.5 text-[13.5px] bg-[#e3f4ea] dark:bg-[#173527] rounded-lg px-2.5 py-1.5">“{r.reply}”</p>}
              </div>
              <div className="flex items-center gap-2">
                {r.itemId && (r.sentAt || r.state === "waiting") && (
                  <a href={`/api/email-preview/${r.itemId}`} target="_blank" rel="noopener" className="text-[13px] font-semibold text-[var(--accent)] hover:underline">
                    See the email
                  </a>
                )}
                <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold whitespace-nowrap ${s.cls}`}>{s.label}</span>
              </div>
            </div>
          );
        })}
        {!rows.length && <p className="text-2 py-6 text-center">Nobody here.</p>}
      </div>

      {t.waiting > 0 && (
        <Link href={`/campaigns/${id}/review`} className="inline-flex mt-4 rounded-xl bg-[var(--accent)] text-white font-bold px-4 min-h-11 items-center">
          Review and send the {t.waiting} waiting
        </Link>
      )}
      <p className="text-[12.5px] text-2 mt-6">
        Got back to you: a reply to the email, or any message from them within 14 days. Replies are found by checking your Gmail for answers to these emails only, every few minutes.
      </p>
    </>
  );
}

function Kpi({ label, value, note, star }: { label: string; value: number; note?: string; star?: boolean }) {
  return (
    <div className={`surface-2 rounded-2xl px-4 py-3.5 ${star ? "border-2" : "border"}`} style={star ? { borderColor: "var(--accent)" } : undefined}>
      <small className="text-2 font-semibold text-[13px]">{label}</small>
      <b className="block text-[28px] font-extrabold tabular-nums leading-tight">{value}</b>
      {note && <span className="text-[12.5px] text-2">{note}</span>}
    </div>
  );
}
