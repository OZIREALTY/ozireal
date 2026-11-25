import { Card, CardTitle, Section } from "@/components/ui";
import { WeeklyChart } from "./weekly-chart";
import type { getSearchOverview, SeoRow, SeoTotals } from "@/server/queries/seo";

/**
 * Google Search Console on the SEO page (2026-11-24): the last 28 days against the 28
 * before, a weekly clicks chart, top searches and pages, quick wins and pages losing
 * traffic. Server-rendered; figures straight from Google, nothing estimated.
 */
type Overview = NonNullable<Awaited<ReturnType<typeof getSearchOverview>>>;

const n = (x: number) => x.toLocaleString("en-AU");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pos = (x: number) => (x ? x.toFixed(1) : "–");
const short = (url: string) => url.replace(/^https?:\/\/(www\.)?ozirealty\.com\.au/, "") || "/";

function Delta({ now, before, lowerIsBetter = false, fmt = (v: number) => n(Math.round(v)) }: { now: number; before: number; lowerIsBetter?: boolean; fmt?: (v: number) => string }) {
  if (!before) return <span className="text-3 text-[11.5px]">no earlier data</span>;
  const d = now - before;
  const good = lowerIsBetter ? d < 0 : d > 0;
  if (Math.abs(d) < 1e-9) return <span className="text-3 text-[11.5px]">no change</span>;
  return (
    <span className={`text-[11.5px] font-medium ${good ? "text-[#1f7a4d] dark:text-[#5fd39a]" : "text-[#b02f2f] dark:text-[#f08a8a]"}`}>
      {good ? "▲" : "▼"} {fmt(Math.abs(d))} vs previous 28 days
    </span>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="text-3 text-[11px] uppercase tracking-[0.06em] font-medium">{label}</div>
      <div className="text-[26px] font-semibold tabular mt-1">{value}</div>
      {children}
    </Card>
  );
}

function Totals({ now, before }: { now: SeoTotals; before: SeoTotals }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
      <Tile label="Clicks from Google" value={n(now.clicks)}><Delta now={now.clicks} before={before.clicks} /></Tile>
      <Tile label="Times shown in Google" value={n(now.impressions)}><Delta now={now.impressions} before={before.impressions} /></Tile>
      <Tile label="Click rate" value={pct(now.ctr)}><Delta now={now.ctr} before={before.ctr} fmt={pct} /></Tile>
      <Tile label="Average position" value={pos(now.position)}><Delta now={now.position} before={before.position} lowerIsBetter fmt={(v) => v.toFixed(1)} /></Tile>
    </div>
  );
}

/**
 * Times shown in Google, by week (2026-11-25). Clicks were 0-2 a week, so a clicks chart
 * made one click a full-height bar; impressions show the trend, clicks are in each tip.
 */
function Weekly({ weeks }: { weeks: Overview["weekly"] }) {
  return (
    <Card className="mb-6">
      <WeeklyChart weeks={weeks} />
    </Card>
  );
}

function Table({ rows, label, link = false, empty }: { rows: SeoRow[]; label: string; link?: boolean; empty: string }) {
  if (!rows.length) return <p className="text-3 text-[12.5px]">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-3 text-left">
            <th className="font-medium py-1.5 pr-3">{label}</th>
            <th className="font-medium py-1.5 px-2 text-right">Clicks</th>
            <th className="font-medium py-1.5 px-2 text-right">Shown</th>
            <th className="font-medium py-1.5 px-2 text-right">Click rate</th>
            <th className="font-medium py-1.5 pl-2 text-right">Position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              <td className="py-1.5 pr-3 max-w-[340px] truncate" title={r.key}>
                {link ? <a href={r.key} target="_blank" rel="noreferrer" className="hover:underline">{short(r.key)}</a> : r.key}
              </td>
              <td className="py-1.5 px-2 text-right tabular">
                {n(r.clicks)}
                {r.prevClicks !== r.clicks && <span className="text-3 text-[11px]"> ({r.clicks > r.prevClicks ? "+" : "−"}{n(Math.abs(r.clicks - r.prevClicks))})</span>}
              </td>
              <td className="py-1.5 px-2 text-right tabular">{n(r.impressions)}</td>
              <td className="py-1.5 px-2 text-right tabular">{pct(r.ctr)}</td>
              <td className="py-1.5 pl-2 text-right tabular">{pos(r.position)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SearchDashboard({ data }: { data: Awaited<ReturnType<typeof getSearchOverview>> }) {
  if (!data) {
    return (
      <Card className="mb-6">
        <CardTitle>Google search</CardTitle>
        <p className="text-2 text-[13px] mt-1">
          Search Console is connected. The first figures arrive after the daily sync (6:15 am), which fills in the last 16 months.
        </p>
      </Card>
    );
  }
  return (
    <>
      <p className="text-3 text-[12px] mb-2">
        Google Search Console · last 28 days to {data.last} (Google reports 2–3 days behind) · history from {data.first}
      </p>
      <Totals now={data.now} before={data.before} />
      <Weekly weeks={data.weekly} />

      <Section title="Quick wins" hint="searches you already appear for on page 1–2, but below the top 4">
        <Card>
          <p className="text-2 text-[12.5px] mb-2">
            Moving these into the top 3 usually brings the biggest gain. Use the phrase in that page&#39;s title, heading and first paragraph.
          </p>
          <Table rows={data.almostThere} label="Search phrase" empty="None yet: nothing with 20+ showings ranks between 5 and 20." />
        </Card>
      </Section>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardTitle>Top searches</CardTitle>
          <Table rows={data.topQueries} label="Search phrase" empty="No searches recorded yet." />
        </Card>
        <Card>
          <CardTitle>Top pages</CardTitle>
          <Table rows={data.topPages} label="Page" link empty="No pages recorded yet." />
        </Card>
      </div>

      {data.losing.length > 0 && (
        <Section title="Pages losing clicks" hint="fewer clicks than the 28 days before">
          <Card>
            <p className="text-2 text-[12.5px] mb-2">Check these first: an outdated post, a broken page or a new competitor are the usual causes.</p>
            <Table rows={data.losing} label="Page" link empty="" />
          </Card>
        </Section>
      )}
    </>
  );
}
