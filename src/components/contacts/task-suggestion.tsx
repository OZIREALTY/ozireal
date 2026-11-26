"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { commitConfirmItem, discardConfirmItem } from "@/server/actions/contacts";

/**
 * A task the AI read out of a note (owner-approved preview, 2026-11-26). Rule 5: it is
 * only a suggestion in the confirm queue until the owner presses Add task.
 */
export type Suggestion = { id: string; title: string; dueInDays: number | null; reason: string | null };

const PRI = [
  { v: 1, l: "🔴 High" },
  { v: 2, l: "🟡 Normal" },
  { v: 3, l: "⚪ Low" },
];
const nineAm = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const nice = (d: Date) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) + ", 9:00 am";

export function TaskSuggestions({ items }: { items: Suggestion[] }) {
  return (
    <>
      {items.map((s) => (
        <One key={s.id} s={s} />
      ))}
    </>
  );
}

function One({ s }: { s: Suggestion }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"ask" | "edit" | "added" | "gone">("ask");
  const [title, setTitle] = React.useState(s.title);
  const [date, setDate] = React.useState(s.dueInDays != null ? ymd(nineAm(s.dueInDays)) : "");
  const [priority, setPriority] = React.useState(2);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [addedTaskDue, setAddedTaskDue] = React.useState<string>("");

  async function add() {
    setBusy(true);
    setError(null);
    const due = date ? new Date(`${date}T09:00:00`) : null;
    const r = await commitConfirmItem({ id: s.id, title: title.trim(), dueAt: due ? due.toISOString() : "", priority }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError(r && !r.ok ? r.error : "Could not reach the server.");
    setAddedTaskDue(due ? nice(due) : "no date");
    setMode("added");
    router.refresh();
  }
  async function no() {
    setBusy(true);
    const r = await discardConfirmItem({ id: s.id }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError(r && !r.ok ? r.error : "Could not reach the server.");
    setMode("gone");
    router.refresh();
  }

  if (mode === "gone") return null;
  if (mode === "added")
    return (
      <div className="mt-2.5 rounded-xl bg-[#E8F5E9] text-[#1B5E20] dark:bg-[#183A1C] dark:text-[#9BE3A2] px-3.5 py-2.5 text-[13.5px] font-semibold">
        ✓ Task added for {addedTaskDue} ·{" "}
        <Link href="/tasks" className="underline underline-offset-2">
          Open Tasks
        </Link>
      </div>
    );

  const due = date ? new Date(`${date}T09:00:00`) : null;
  const btn = "rounded-[10px] px-3.5 min-h-9 text-[13.5px] font-bold";
  return (
    <div className="mt-2.5 rounded-xl border-[1.5px] border-[var(--accent)] bg-[var(--accent)]/[0.05] px-3.5 py-3 animate-[sug-in_.35s_ease-out]">
      <p className="text-[12.5px] font-bold text-[var(--accent)] mb-1.5">✦ Task suggested from this note</p>
      {mode === "ask" ? (
        <>
          <p className="text-[15px] font-bold leading-snug">{title}</p>
          <div className="flex flex-wrap gap-1.5 my-2">
            <span className="rounded-full border surface-2 px-2.5 py-0.5 text-[12.5px] font-semibold">📅 {due ? nice(due) : "No date"}</span>
            <span className="rounded-full bg-[#FFF1DC] text-[#8A4B00] px-2.5 py-0.5 text-[12.5px] font-semibold">🟡 Normal</span>
          </div>
          {s.reason && <p className="text-2 text-[12px] mb-2.5">Because the note says: {s.reason}</p>}
        </>
      ) : (
        <div className="grid sm:grid-cols-[2fr_1fr_1fr] gap-2 my-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task" className="rounded-[9px] border surface-2 px-2.5 min-h-9 text-[13.5px]" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date" className="rounded-[9px] border surface-2 px-2.5 min-h-9 text-[13.5px]" />
          <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} aria-label="Priority" className="rounded-[9px] border surface-2 px-2 min-h-9 text-[13.5px]">
            {PRI.map((p) => (
              <option key={p.v} value={p.v}>
                {p.l}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-[12.5px] text-[#b02f2f] mb-2">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || title.trim().length < 3} onClick={add} className={`${btn} bg-[var(--accent)] text-white inline-flex items-center gap-1.5 disabled:opacity-50`}>
          {busy && <Loader2 size={14} className="animate-spin" />}✓ Add task
        </button>
        {mode === "ask" ? (
          <button type="button" onClick={() => setMode("edit")} className={`${btn} border surface-2`}>
            Edit first
          </button>
        ) : (
          <button type="button" onClick={() => setMode("ask")} className={`${btn} text-2`}>
            Cancel
          </button>
        )}
        {mode === "ask" && (
          <button type="button" disabled={busy} onClick={no} className={`${btn} text-2`}>
            No thanks
          </button>
        )}
      </div>
      <style>{`@keyframes sug-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

/**
 * The AI reads a note a few seconds after it is saved (a background job). While the
 * newest note is not read yet, refresh quietly every 4 s for up to a minute so the
 * suggestion appears without a reload.
 */
export function WaitForReading({ pending }: { pending: boolean }) {
  const router = useRouter();
  React.useEffect(() => {
    if (!pending) return;
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      if (n > 15) return window.clearInterval(t);
      router.refresh();
    }, 4000);
    return () => window.clearInterval(t);
  }, [pending, router]);
  return pending ? <p className="mt-2 text-3 text-[12px]">✦ Reading this note for reminders…</p> : null;
}

