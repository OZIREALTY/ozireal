import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { InsightsTabs } from "@/components/shell/insights-tabs";
import { CampaignTabs } from "@/components/campaigns/tabs";
import { emailInsights, TYPE_LABEL } from "@/server/queries/email-insights";
import { currentTenantId } from "@/db";
import { checkRepliesFor, lastReplyCheck } from "@/server/outbound/replies";
import { ReplyCheck } from "@/components/campaigns/reply-check";
import { RangePicker } from "@/components/campaigns/range-picker";
import { adelaide, adelaideLabel, adelaideToday } from "@/lib/adelaide-time";

export const dynamic = "force-dynamic";

/**
 * Email insights (owner-approved preview, 2026-11-20): every email the CRM sent, whatever
 * started it. Replies are the number that matters; opens are a rough signal.
 */
const RANGES = [
  { k: "today", label: "Today", days: null },
  { k: "7", label: "7 days", days: 7 },
  { k: "30", label: "30 days", days: 30 },
  { k: "90", label: "90 days", days: 90 },
  { k: "all", label: "All", days: null },
] as const;
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

export default async function EmailInsightsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; ft?: string; tt?: string }> }) {
  const sp = await searchParams;
  const range = sp.range ?? "30";
  /**
   * The window (owner, 2026-11-27): Today and Custom (dates and times, Adelaide time) as
   * well as the rolling 7 / 30 / 90 days and All.
   */
  let custom: { from: Date; to: Date; label: string } | null = null;
  if (range === "custom" && sp.from && sp.to) {
    const f = adelaide(sp.from, sp.ft ?? "00:00");
    const tEnd = sp.tt ? adelaide(sp.to, sp.tt) : adelaide(sp.to, "00:00");
    const t = tEnd && !sp.tt ? new Date(tEnd.getTime() + 864e5) : tEnd;
    if (f && t && f < t) custom = { from: f, to: t, label: sp.tt ? `${adelaideLabel(f)} → ${adelaideLabel(t)}` : `${sp.from === sp.to ? "" : adelaideLabel(f).replace(/,.*$/, "") + " → "}${adelaideLabel(new Date(t.getTime() - 1)).replace(/,.*$/, "")} (whole days)` };
  }
  const r = custom ? { k: "custom", label: "Custom", days: null } : (RANGES.find((x) => x.k === range) ?? RANGES[2]);
  const win = custom
    ? { from: custom.from, to: custom.to }
    : r.k === "today"
      ? { from: adelaide(adelaideToday()), to: null }
      : { from: r.days ? new Date(Date.now() - r.days * 864e5) : null, to: null };
  /**
   * Opening the report also starts a reply check (at most once a minute), so the numbers do
   * not depend on the background worker alone (owner, 2026-11-20).
   */
  const tenantId = await currentTenantId();
  const last = await lastReplyCheck(tenantId);
  /**
   * The reply check used to run BEFORE the page rendered and could hold it for up to 15 s
   * (a Gmail login), so a click on the Email tab looked dead (owner, 2026-11-25). It now
   * starts in the background and the page shows at once; the worker also checks every 5
   * minutes, and "Check replies now" is still on the page.
   */
  if (!last || Date.now() - new Date(last.at).getTime() > 60_000) {
    void checkRepliesFor(tenantId).catch(() => undefined);
  }
  const d = await emailInsights(win);
  const t = d.totals;
  const compared = !!win.from;
  const diff = compared ? t.sent - d.before.sent : null;
  const rDiff = compared && d.before.sent ? (t.replyRate - d.before.replyRate) * 100 : null;
  const beforeLabel = r.days ? `the ${r.days} days before` : r.k === "today" ? "the day before" : "the same length before";

  return (
    <>
      <InsightsTabs />
      <PageHeader title="Email insights" subtitle="Every email the CRM sent: emails you wrote here, matched-buyer emails and single emails to a contact." />
      <CampaignTabs active="insights" />
      <ReplyCheck last={last} />

      <div className="flex gap-1 surface-2 border rounded-xl p-1 w-max max-w-full flex-wrap mb-4">
        {RANGES.map((x) => (
          <Link
            key={x.k}
            href={`/campaigns/insights?range=${x.k}`}
            className={`rounded-lg px-3 min-h-9 inline-flex items-center text-[13.5px] font-semibold ${x.k === r.k ? "bg-[var(--text)] text-[var(--surface-2)]" : "text-2"}`}
          >
            {x.label}
          </Link>
        ))}
        <RangePicker
          active={!!custom}
          initial={{ from: sp.from ?? adelaideToday(), to: sp.to ?? adelaideToday(), fromTime: sp.ft ?? "09:00", toTime: sp.tt ?? "17:00", whole: !sp.ft }}
        />
      </div>
      {custom && (
        <Link href="/campaigns/insights?range=7" className="inline-flex items-center gap-2 -mt-2 mb-4 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] px-3 py-1.5 text-[13.5px] font-bold">
          {custom.label} <span aria-label="Clear">✕</span>
        </Link>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <Kpi label="Sent" value={String(t.sent)} note={diff !== null ? `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff)} on ${beforeLabel}` : undefined} />
        <Kpi
          label="Opened (confirmed)"
          value={pct(t.openRate)}
          note={`${t.opened} ${t.opened === 1 ? "email" : "emails"}${d.autoOnly ? ` · +${d.autoOnly} Apple, unconfirmed` : ""}`}
        />
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
          <Tbl head={["Type", "Sent", "Opened", "Clicked", "Got back to you"]} left={1}>
            {d.byType.map((x) => (
              <tr key={x.type} className="border-t">
                <td className="px-3 py-2.5 font-semibold">{x.label}</td>
                <Num>{x.sent}</Num>
                <Num>{pct(x.openRate)}</Num>
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
          <Tbl head={["Email", "Type", "Sent", "People", "Opened", "Clicked", "Got back to you"]} left={3}>
            {d.batches.map((b) => (
              <tr key={b.id} className="border-t hover:bg-[var(--surface)]">
                <td className="px-3 py-2.5">
                  <Link href={`/campaigns/${b.id}`} className="font-bold hover:underline underline-offset-2">{b.name}</Link>
                </td>
                <td className="px-3 py-2.5 text-2 whitespace-nowrap">{TYPE_LABEL[b.type]}</td>
                <td className="px-3 py-2.5 text-2 whitespace-nowrap">{b.sentAt.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</td>
                <Num>{b.sent}</Num>
                <Num>{pct(b.openRate)}</Num>
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

      {d.openers.length > 0 && (
        <>
          <H2>Who opened (confirmed)</H2>
          <div className="space-y-1.5">
            {d.openers.map((o) => (
              <div key={o.id} className="surface-2 border rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  {o.contactId ? (
                    <Link href={`/contacts/${o.contactId}`} className="font-bold hover:underline underline-offset-2">{o.name || "Unnamed"}</Link>
                  ) : (
                    <b>{o.name || "Unnamed"}</b>
                  )}
                  <small className="block text-2 text-[12.5px]">
                    {(o.campaignName ?? "Email").replace(/^Matched buyers: /, "")} · first opened{" "}
                    {(o.openedAt as Date).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Adelaide" })}
                    {" · "}
                    {o.opens} {o.opens === 1 ? "open" : "opens"}
                  </small>
                </div>
                <span className="flex gap-1.5">
                  {o.clicked && <Tag>Clicked</Tag>}
                  {o.replied && <Tag>Got back to you</Tag>}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-[12.5px] text-2 mt-6">
        Opened (confirmed): a person&apos;s mail app or Gmail, Yahoo or Outlook loaded the email when it was opened. Apple Mail loads every email automatically on arrival, so those are shown apart as unconfirmed; security scanners are ignored. People who block images are not seen at all, so the true figure is at least this. Counted from 23 Nov 2026.{" "}
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

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold bg-[var(--accent)]/10 text-[var(--accent)]">{children}</span>;
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
