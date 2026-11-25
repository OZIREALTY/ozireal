"use client";

import * as React from "react";

/**
 * Google search by week (owner, 2026-11-25: compact, every bar readable, filterable).
 *
 * Filters: the range (3, 6, 12 months, or all synced history) and the measure (times
 * shown, clicks, click rate, average position). A date under every other bar, gridlines
 * with their values, and an instant line above the chart for the hovered (or tapped) bar.
 * For position, a SHORTER bar is better (position 1 is the top of Google), and it says so.
 */
type Week = { start: string; clicks: number; impressions: number; position: number | null };

const RANGES = [
  { k: 13, label: "3 months" },
  { k: 26, label: "6 months" },
  { k: 52, label: "12 months" },
  { k: 0, label: "All" },
] as const;
const MEASURES = [
  { k: "impressions", label: "Times shown" },
  { k: "clicks", label: "Clicks" },
  { k: "ctr", label: "Click rate" },
  { k: "position", label: "Avg position" },
] as const;
type Measure = (typeof MEASURES)[number]["k"];

const n = (x: number) => x.toLocaleString("en-AU");
const fmt = (m: Measure, v: number) => (m === "ctr" ? `${(v * 100).toFixed(1)}%` : m === "position" ? v.toFixed(1) : n(Math.round(v)));
const day = (iso: string, withYear = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

export function WeeklyChart({ weeks: all }: { weeks: Week[] }) {
  const [range, setRange] = React.useState<number>(26);
  const [measure, setMeasure] = React.useState<Measure>("impressions");
  const [hover, setHover] = React.useState<number | null>(null);

  const weeks = range ? all.slice(-range) : all;
  const val = (w: Week): number | null =>
    measure === "ctr" ? (w.impressions ? w.clicks / w.impressions : 0) : measure === "position" ? w.position : w[measure];
  const vals = weeks.map(val);
  const max = Math.max(measure === "ctr" ? 0.001 : 1, ...vals.map((v) => v ?? 0));
  const H = 110;
  const gap = weeks.length > 40 ? 1 : weeks.length > 20 ? 2 : 3;
  const every = Math.max(1, Math.ceil(weeks.length / 13));
  const h = hover != null && hover < weeks.length ? hover : weeks.length - 1;
  const cur = weeks[h];
  const label = MEASURES.find((m) => m.k === measure)!.label;

  const chip = (on: boolean) =>
    `rounded-full border px-2.5 min-h-7 text-[12px] font-semibold ${on ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "text-2 hover:surface-3"}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <b className="text-[14px] mr-auto">{label} in Google, by week</b>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Measure">
          {MEASURES.map((m) => (
            <button key={m.k} type="button" className={chip(measure === m.k)} aria-pressed={measure === m.k} onClick={() => setMeasure(m.k)}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.k} type="button" className={chip(range === r.k)} aria-pressed={range === r.k} onClick={() => { setRange(r.k); setHover(null); }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[20px] mb-2 text-[12.5px] text-2">
        {cur ? (
          <>
            Week of <b className="text-[var(--text)]">{day(cur.start, true)}</b>: shown <b className="text-[var(--text)]">{n(cur.impressions)}</b> times ·{" "}
            <b className="text-[var(--text)]">{n(cur.clicks)}</b> click{cur.clicks === 1 ? "" : "s"}
            {cur.position != null && <> · average position <b className="text-[var(--text)]">{cur.position.toFixed(1)}</b></>}
            {hover == null && <span className="text-3"> (latest week; hover or tap a bar)</span>}
          </>
        ) : (
          "No data yet"
        )}
      </div>

      <div className="relative" style={{ height: H }}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-[var(--text)]/10" />
        <div className="absolute inset-x-0 border-t border-dashed border-[var(--text)]/10" style={{ top: H / 2 }} />
        <span className="absolute right-0 text-[10px] text-3 -translate-y-1/2 surface-2 pl-1" style={{ top: 0 }}>{fmt(measure, max)}</span>
        <span className="absolute right-0 text-[10px] text-3 -translate-y-1/2 surface-2 pl-1" style={{ top: H / 2 }}>{fmt(measure, max / 2)}</span>
        <div className="absolute inset-0 flex items-end pr-12" style={{ gap }} onMouseLeave={() => setHover(null)}>
          {weeks.map((w, i) => {
            const v = vals[i];
            const pct = v ? Math.max(2, (v / max) * 100) : 0;
            const on = i === h;
            return (
              <button
                key={w.start}
                type="button"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => setHover(i)}
                aria-label={`Week of ${day(w.start, true)}: ${label.toLowerCase()} ${v == null ? "none" : fmt(measure, v)}`}
                className="relative flex-1 min-w-0 h-full flex items-end cursor-pointer"
              >
                <span
                  className="block w-full rounded-t-[3px] transition-colors"
                  style={{ height: `${pct}%`, background: on ? "var(--accent)" : "color-mix(in srgb, var(--accent) 50%, transparent)" }}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex pr-12 mt-1" style={{ gap }}>
        {weeks.map((w, i) => (
          <span key={w.start} className={`flex-1 min-w-0 text-center text-[10px] whitespace-nowrap ${i === h ? "text-[var(--text)] font-semibold" : "text-3"}`}>
            {i === h || (i % every === 0 && Math.abs(i - h) >= every) ? day(w.start) : ""}
          </span>
        ))}
      </div>
      {measure === "position" && <p className="text-3 text-[11.5px] mt-1.5">Average position: shorter is better (1 is the top of Google).</p>}
    </div>
  );
}
