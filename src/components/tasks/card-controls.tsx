"use client";

import * as React from "react";
import { DateApply } from "@/components/ui/date-apply";

/**
 * Date and priority set inside the card (owner-approved preview, 2026-11-26), replacing
 * the floating ⋯ menu on the board: a tray opens in the card, you pick, it closes.
 */
const P: Record<number, { l: string; cls: string }> = {
  1: { l: "High", cls: "bg-[#FDE7E2] text-[#A12A12] border-[#FDE7E2]" },
  2: { l: "Normal", cls: "bg-[#FFF1DC] text-[#8A4B00] border-[#FFF1DC]" },
  3: { l: "Low", cls: "bg-[#C9D0DD] text-[#25314A] border-[#C9D0DD]" },
};

const at9 = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
};
const nextMonday = () => {
  let n = 1;
  while (at9(n).getDay() !== 1) n++;
  return at9(n);
};

export function CardControls({
  dueLabel,
  overdue,
  priority,
  onDue,
  onPriority,
}: {
  dueLabel: string;
  overdue: boolean;
  priority: number;
  onDue: (d: Date | null) => void;
  onPriority: (p: number) => void;
}) {
  const [open, setOpen] = React.useState<null | "d" | "p">(null);
  const pill = "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold";
  const opt = "rounded-[9px] border surface-2 px-2.5 min-h-8 text-[12.5px] font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)]";
  const today = new Date();
  const endToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17);
  const pick = (d: Date | null) => {
    setOpen(null);
    onDue(d);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-expanded={open === "d"}
          onClick={() => setOpen(open === "d" ? null : "d")}
          className={`${pill} ${open === "d" ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10" : overdue ? "border-[#F3C2B6] text-[#A12A12] surface-2" : "surface-2 text-2 hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}
        >
          📅 {dueLabel} ▾
        </button>
        <button type="button" aria-expanded={open === "p"} onClick={() => setOpen(open === "p" ? null : "p")} className={`${pill} ${P[priority]?.cls ?? P[2].cls}`}>
          {P[priority]?.l ?? "Normal"} ▾
        </button>
      </div>
      <div className={`grid transition-[grid-template-rows,margin] duration-200 ${open ? "grid-rows-[1fr] mt-2" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          {open === "d" && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-dashed">
              <button type="button" className={opt} onClick={() => pick(endToday)}>Today</button>
              <button type="button" className={opt} onClick={() => pick(at9(1))}>Tomorrow</button>
              <button type="button" className={opt} onClick={() => pick(nextMonday())}>Next Mon</button>
              <button type="button" className={opt} onClick={() => pick(at9(7))}>In a week</button>
              <div className="w-full -mx-2.5">
                <DateApply label="" onApply={(d) => pick(d)} />
              </div>
              <button type="button" className={opt} onClick={() => pick(null)}>No date</button>
            </div>
          )}
          {open === "p" && (
            <div className="flex gap-1.5 pt-2 border-t border-dashed">
              {[1, 2, 3].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setOpen(null);
                    if (p !== priority) onPriority(p);
                  }}
                  className={`flex-1 rounded-[9px] min-h-8 text-[12.5px] font-bold ${P[p].cls} ${p === priority ? "ring-2 ring-[var(--text)]/30" : ""}`}
                >
                  {P[p].l}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
