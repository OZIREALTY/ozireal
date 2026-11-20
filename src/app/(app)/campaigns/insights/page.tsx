import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { CampaignTabs } from "@/components/campaigns/tabs";
import { emailInsights, TYPE_LABEL } from "@/server/queries/email-insights";
import { currentTenantId } from "@/db";
import { checkRepliesFor, lastReplyCheck } from "@/server/outbound/replies";
import { ReplyCheck } from "@/components/campaigns/reply-check";

export const dynamic = "force-dynamic";

/**
 * Email insights (owner-approved preview, 2026-11-20): every email the CRM sent, whatever
 * started it. Replies are the number that matters; opens are a rough signal.
 */
const RANGES = [
  { k: "7", label: "7 days", days: 7 },
  { k: "30", label: "30 days", days: 30 },
  { k: "90", label: "90 days", days: 90 },
  { k: "all", label: "All", days: null },
] as const;
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

export default async function EmailInsightsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range = "30" } = await searchParams;
  const r = RANGES.find((x) => x.k === range) ?? RANGES[1];
  /**
   * Opening the report reads new replies first (at most once a minute), so the numbers do
   * not depend on the background worker alone (owner, 2026-11-20).
   */
  const tenantId = await currentTenantId();
  let last = await lastReplyCheck(tenantId);
  if (!last || Date.now() - new Date(last.at).getTime() > 60_000) {
    last = await Promise.race([
      checkRepliesFor(tenantId),
      new Promise<typeof last>((res) => setTimeout(() => res(last), 15_000)),
    ]);
  }
  const d = await emailInsights(r.days);
  const t = d.totals;
  const diff = r.days ? t.sent - d.before.sent : null;
  const rDiff = r.days && d.before.sent ? (t.replyRate - d.before.replyRate) * 100 : null;

  return (
    <>
      <PageHeader title="Email insights" subtitle="Every email the CRM sent: emails you wrote here, matched-buyer emails and single emails to a contact." />
      <CampaignTabs active="insights" />
      <ReplyCheck last={last} />

      <div className="flex gap-1 surface-2 border rounded-xl p-1 w-max max-w-full overflow-x-auto mb-4">
        {RANGES.map((x) => (
          <Link
            key={x.k}
            href={`/campaigns/insights?range=${x.k}`}
            className={`rounded-lg px-3 min-h-9 inline-flex items-center text-[13.5px] font-semibold ${x.k === r.k ? "bg-[var(--text)] text-[var(--surface-2)]" : "text-2"}`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        <Kpi label="Sent" value={String(t.sent)} note={diff !== null ? `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff)} on the ${r.days} days before` : undefined} />
        <Kpi label="Clicked the listing" value={pct(t.clickRate)} note={`${t.clicked} emails`} />
        <Kpi
          star
          label="Got back to you"
          value={pct(t.replyRate)}
          note={`${t.replied} ${t.replied === 1 ? "reply" : "replies"}${rDiff !== null ? ` · ${rDiff >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(rDiff * 10) / 10)} pts` : ""}`}
        />
        <Kpi label="Unsubscribed" value={String(d.unsubscribed)} note={t.sent ? `${pct(d.unsubscribed / t.sent)} · healthy under 2%` : undefined} />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 mt-3">
        <div className="surface-2 border rounded-2xl p-4 min-w-0">
          <h3 className="font-bold text-[15.5px]">Responses each week</h3>
          <p className="text-2 text-[13px] mb-3">Bars are emails sent; the line is the share who got back to you.</p>
          <WeekChart weeks={d.weekly} />
        </div>
        <div className="surface-2 border rounded-2xl p-4 min-w-0">
          <h3 className="font-bold text-[15.5px]">What the numbers say</h3>
          <p className="text-2 text-[13px] mb-3">Worked out from the emails in this period.</p>
          <div className="space-y-2">
            {d.notes.map((n) => (
              <p key={n} className="bg-[var(--surface)] rounded-xl px-3 py-2.5 text-[14px]">{n}</p>
            ))}
          </div>
        </div>
      </div>

      {d.byType.length > 0 && (
        <>
          <H2>By type of email</H2>
          <Tbl head={["Type", "Sent", "Clicked", "Got back to you"]} left={1}>
            {d.byType.map((x) => (
              <tr key={x.type} className="border-t">
                <td className="px-3 py-2.5 font-semibold">{x.label}</td>
                <Num>{x.sent}</Num>
                <Num>{pct(x.clickRate)}</Num>
                <Num bold>{pct(x.replyRate)}</Num>
              </tr>
            ))}
          </Tbl>
        </>
      )}

      {d.batches.length > 0 && (
        <>
          <H2>Every batch</H2>
          <Tbl head={["Email", "Type", "Sent", "People", "Clicked", "Got back to you"]} left={3}>
            {d.batches.map((b) => (
              <tr key={b.id} className="border-t hover:bg-[var(--surface)]">
                <td className="px-3 py-2.5">
                  <Link href={`/campaigns/${b.id}`} className="font-bold hover:underline underline-offset-2">{b.name}</Link>
                </td>
                <td className="px-3 py-2.5 text-2 whitespace-nowrap">{TYPE_LABEL[b.type]}</td>
                <td className="px-3 py-2.5 text-2 whitespace-nowrap">{b.sentAt.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
                <Num>{b.sent}</Num>
                <Num>{pct(b.clickRate)}</Num>
                <Num bold>{pct(b.replyRate)}</Num>
              </tr>
            ))}
          </Tbl>
        </>
      )}

      {d.quiet.length > 0 && (
        <>
          <H2>Interested but quiet: worth a call</H2>
          <div className="space-y-1.5">
            {d.quiet.map((q) => (
              <div key={q.id} className="surface-2 border rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  {q.contactId ? (
                    <Link href={`/contacts/${q.contactId}`} className="font-bold hover:underline underline-offset-2">{q.name || "Unnamed"}</Link>
                  ) : (
                    <b>{q.name}</b>
                  )}
                  <small className="block text-2 text-[12.5px]">
                    {(q.campaignName ?? "Email").replace(/^Matched buyers: /, "")} · clicked the listing · has not got back to you
                  </small>
                </div>
                <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold bg-[var(--accent)]/10 text-[var(--accent)]">Clicked</span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-[12.5px] text-2 mt-6">
        Got back to you: they replied to the email, or contacted you in any way (email, website form, a logged call or visit) within 14 days of it.
      </p>
    </>
  );
}

function Kpi({ label, value, note, star }: { label: string; value: string; note?: string; star?: boolean }) {
  return (
    <div className={`surface-2 rounded-2xl px-4 py-3.5 ${star ? "border-2" : "border"}`} style={star ? { borderColor: "var(--accent)" } : undefined}>
      <small className="text-2 font-semibold text-[13px]">{label}</small>
      <b className="block text-[28px] font-extrabold tabular-nums leading-tight">{value}</b>
      {note && <span className="text-[12.5px] text-2">{note}</span>}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[13px] tracking-wider uppercase text-2 font-bold mt-7 mb-2.5">{children}</h2>;
}

function Tbl({ head, left, children }: { head: string[]; left: number; children: React.ReactNode }) {
  return (
    <div className="surface-2 border rounded-2xl overflow-x-auto">
      <table className="w-full min-w-[600px] text-[14px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 text-[12px] uppercase tracking-wider text-2 font-bold ${i < left ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Num({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <td className={`px-3 py-2.5 text-right tabular-nums ${bold ? "font-extrabold" : ""}`}>{children}</td>;
}

function WeekChart({ weeks }: { weeks: { week: string; sent: number; replied: number }[] }) {
  if (!weeks.length) return <p className="text-2 text-[14px] py-10 text-center">Nothing sent in this period.</p>;
  const W = 520;
  const H = 190;
  const L = 40;
  const B = 150;
  const T = 20;
  const max = Math.max(4, ...weeks.map((w) => w.sent));
  const step = (W - L - 10) / weeks.length;
  const bw = Math.min(70, step * 0.6);
  const maxRate = Math.max(0.05, ...weeks.map((w) => (w.sent ? w.replied / w.sent : 0)));
  const pts = weeks.map((w, i) => {
    const x = L + step * i + step / 2;
    const rr = w.sent ? w.replied / w.sent : 0;
    return { x, y: B - (rr / maxRate) * (B - T - 14), r: rr };
  });
  const last = pts[pts.length - 1];
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Emails sent and reply rate per week">
        <g stroke="var(--line)">
          <line x1={L} y1={T} x2={W - 10} y2={T} />
          <line x1={L} y1={(T + B) / 2} x2={W - 10} y2={(T + B) / 2} />
          <line x1={L} y1={B} x2={W - 10} y2={B} />
        </g>
        <g fill="var(--text-2)" fontSize="11">
          <text x={L - 8} y={T + 4} textAnchor="end">{max}</text>
          <text x={L - 8} y={(T + B) / 2 + 4} textAnchor="end">{Math.round(max / 2)}</text>
          <text x={L - 8} y={B + 4} textAnchor="end">0</text>
        </g>
        {weeks.map((w, i) => {
          const h = (w.sent / max) * (B - T);
          const x = L + step * i + step / 2;
          return (
            <g key={w.week}>
              <rect x={x - bw / 2} y={B - h} width={bw} height={h} rx="5" fill="var(--surface)" stroke="var(--line)" />
              <text x={x} y={B + 18} textAnchor="middle" fill="var(--text-2)" fontSize="11">
                {new Date(w.week).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
              </text>
            </g>
          );
        })}
        <polyline fill="none" stroke="var(--accent)" strokeWidth="3" points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 6 : 4} fill="var(--accent)" />
        ))}
        <text x={last.x} y={last.y - 11} textAnchor="middle" fill="var(--accent)" fontSize="12" fontWeight="700">
          {Math.round(last.r * 100)}%
        </text>
      </svg>
      <div className="flex gap-4 text-[12.5px] text-2 mt-1">
        <span>
          <i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 border bg-[var(--surface)]" />
          Emails sent
        </span>
        <span>
          <i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 bg-[var(--accent)]" />
          Got back to you
        </span>
      </div>
    </>
  );
}
