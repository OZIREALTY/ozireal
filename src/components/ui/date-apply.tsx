"use client";

import * as React from "react";

/**
 * A date box with its own "Set" button (owner bug report, 2026-11-26). The browser's
 * date input fires a change while you browse months or type, so applying on change
 * moved the task before a date was really chosen. Nothing happens until Set.
 */
export function DateApply({ label, onApply, min }: { label: string; onApply: (d: Date) => void; min?: string }) {
  const [v, setV] = React.useState("");
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(v) && (!min || v >= min);
  return (
    <div className="px-2.5 py-1.5">
      <p className="text-[13.5px] mb-1">{label}</p>
      <div className="flex gap-1.5">
        <input
          type="date"
          value={v}
          min={min}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ok) onApply(new Date(`${v}T09:00:00`));
          }}
          className="flex-1 min-w-0 rounded-md border px-2 min-h-8 bg-transparent text-[13px]"
        />
        <button
          type="button"
          disabled={!ok}
          onClick={() => onApply(new Date(`${v}T09:00:00`))}
          className="rounded-md bg-[var(--accent)] text-white px-2.5 min-h-8 text-[12.5px] font-bold disabled:opacity-40"
        >
          Set
        </button>
      </div>
    </div>
  );
}
