"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Custom date and time range for Email insights (owner-approved preview, 2026-11-27).
 * Quick picks fill the boxes; nothing changes until Show. Times are Adelaide time and
 * travel in the URL as plain date and time, so the page can be bookmarked or shared.
 */
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function quick(k: string): { f: string; t: string } {
  const now = new Date();
  const day = (o: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + o);
    return d;
  };
  const monday = (o: number) => {
    const d = day(-((now.getDay() + 6) % 7) + o * 7);
    return d;
  };
  switch (k) {
    case "yesterday":
      return { f: ymd(day(-1)), t: ymd(day(-1)) };
    case "thisweek":
      return { f: ymd(monday(0)), t: ymd(now) };
    case "lastweek": {
      const s = monday(-1);
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      return { f: ymd(s), t: ymd(e) };
    }
    case "thismonth":
      return { f: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), t: ymd(now) };
    case "lastmonth":
      return { f: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), t: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
    default:
      return { f: ymd(now), t: ymd(now) };
  }
}

const QUICK = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["thisweek", "This week"],
  ["lastweek", "Last week"],
  ["thismonth", "This month"],
  ["lastmonth", "Last month"],
] as const;

export function RangePicker({ active, initial }: { active: boolean; initial: { from: string; fromTime: string; to: string; toTime: string; whole: boolean } }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState(initial);
  const [q, setQ] = React.useState<string | null>(null);
  const ok = v.from && v.to && `${v.from}T${v.whole ? "00:00" : v.fromTime}` <= `${v.to}T${v.whole ? "23:59" : v.toTime}`;

  function show() {
    const p = new URLSearchParams({ range: "custom", from: v.from, to: v.to });
    if (!v.whole) {
      p.set("ft", v.fromTime);
      p.set("tt", v.toTime);
    }
    setOpen(false);
    router.push(`/campaigns/insights?${p}`);
  }

  const inp = "rounded-[9px] border surface-2 px-2.5 min-h-9 text-[14px]";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`rounded-lg px-3 min-h-9 inline-flex items-center text-[13.5px] font-semibold ${active ? "bg-[var(--text)] text-[var(--surface-2)]" : "text-2"}`}
      >
        Custom…
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 sm:left-auto sm:right-0 top-11 z-50 w-[min(520px,calc(100vw-32px))] rounded-2xl border surface-2 shadow-xl p-4">
            <b className="block text-[14px] mb-2.5">Choose dates and times</b>
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {QUICK.map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    const r = quick(k);
                    setQ(k);
                    setV({ ...v, from: r.f, to: r.t, whole: true });
                  }}
                  className={`rounded-full border px-3 min-h-8 text-[13px] font-semibold ${q === k ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "text-2"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {(["from", "to"] as const).map((side) => (
              <div key={side} className="grid grid-cols-[52px_1fr_120px] gap-2 items-center mb-2">
                <span className="text-[13px] font-semibold text-2">{side === "from" ? "From" : "To"}</span>
                <input type="date" value={v[side]} onChange={(e) => { setQ(null); setV({ ...v, [side]: e.target.value }); }} className={inp} />
                <input
                  type="time"
                  disabled={v.whole}
                  value={side === "from" ? v.fromTime : v.toTime}
                  onChange={(e) => setV({ ...v, [side === "from" ? "fromTime" : "toTime"]: e.target.value })}
                  className={`${inp} disabled:opacity-40`}
                />
              </div>
            ))}
            <label className="flex items-center gap-2 text-[13px] text-2 mt-1 mb-3">
              <input type="checkbox" checked={v.whole} onChange={(e) => setV({ ...v, whole: e.target.checked })} className="accent-[var(--accent)]" /> Whole days (ignore the times)
            </label>
            {!ok && v.from && v.to && <p className="text-[12.5px] text-[#b02f2f] mb-2">“To” must be after “From”.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-[10px] border px-4 min-h-9 text-[13.5px] font-bold">
                Cancel
              </button>
              <button type="button" disabled={!ok} onClick={show} className="rounded-[10px] bg-[var(--accent)] text-white px-4 min-h-9 text-[13.5px] font-bold disabled:opacity-50">
                Show
              </button>
            </div>
            <p className="text-3 text-[11.5px] mt-2">Adelaide time.</p>
          </div>
        </>
      )}
    </div>
  );
}
