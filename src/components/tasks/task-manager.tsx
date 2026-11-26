"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, LayoutList, Columns3, MoreHorizontal, Paperclip, Search } from "lucide-react";
import { completeTask, reopenTask, updateTask } from "@/server/actions/ops";
import { EditTaskButton, DeleteTaskButton } from "@/components/forms/ops-forms";
import { TaskBoard } from "./task-board";

/**
 * The Tasks page (owner-approved preview, 2026-11-26): numbers at a glance, search,
 * filters, grouping, sorting, List or Board, and a ⋯ menu that changes priority or
 * date in one tap. In Board view a card dragged to another column changes priority.
 * View choices are remembered on this device only.
 */
export type TaskRow = {
  id: string;
  title: string;
  details: string | null;
  otherLabel: string | null;
  contactId: string | null;
  contactName: string | null;
  listingId: string | null;
  priority: number;
  sortOrder: number | null;
  propertyId: string | null;
  propertyLabel: string | null;
  dueAt: Date | null;
  done: boolean;
  completedAt: Date | null;
  createdAt: Date;
  source: string | null;
  files: { id: string; name: string }[];
};
type Opt = { value: string; label: string };
type Group = "due" | "priority" | "contact" | "none";
type Sort = "due" | "priority" | "newest";
type Chip = "all" | "p1" | "p2" | "p3" | "contact" | "files";
type Stat = "none" | "overdue" | "today" | "week" | "high";

const P = {
  1: { l: "High", cls: "bg-[#FDE7E2] text-[#A12A12]" },
  2: { l: "Normal", cls: "bg-[#FFF1DC] text-[#8A4B00]" },
  3: { l: "Low", cls: "bg-[#C9D0DD] text-[#25314A]" },
} as Record<number, { l: string; cls: string }>;

const dayStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtDue = (d: Date) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

export function TaskManager({ tasks, contacts, listings }: { tasks: TaskRow[]; contacts: Opt[]; listings: Opt[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [group, setGroup] = React.useState<Group>("due");
  const [sort, setSort] = React.useState<Sort>("due");
  const [view, setView] = React.useState<"list" | "board">("list");
  const [chip, setChip] = React.useState<Chip>("all");
  const [stat, setStat] = React.useState<Stat>("none");
  const [showDone, setShowDone] = React.useState(false);
  const [menu, setMenu] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{ msg: string; undo: () => Promise<void> } | null>(null);
  const toastTimer = React.useRef<number | undefined>(undefined);
  const onSaved = React.useCallback(
    (msg: string, undo: () => Promise<void>) => {
      window.clearTimeout(toastTimer.current);
      setToast({ msg, undo });
      toastTimer.current = window.setTimeout(() => setToast(null), 5000);
      router.refresh();
    },
    [router],
  );
  // Optimistic changes until the server's fresh list arrives.
  const [local, setLocal] = React.useState<Record<string, Partial<TaskRow>>>({});
  React.useEffect(() => setLocal({}), [tasks]);

  React.useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("tasks-view") ?? "{}");
      if (v.group) setGroup(v.group);
      if (v.sort) setSort(v.sort);
      if (v.view) setView(v.view);
    } catch {}
  }, []);
  const remember = (patch: object) => {
    try {
      localStorage.setItem("tasks-view", JSON.stringify({ group, sort, view, ...patch }));
    } catch {}
  };

  const all = tasks.map((t) => ({ ...t, ...local[t.id] }) as TaskRow);
  const today = dayStart();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  const weekAgo = addDays(today, -7);
  const due = (t: TaskRow) => (t.dueAt ? new Date(t.dueAt) : null);
  const isOverdue = (t: TaskRow) => !!due(t) && due(t)! < today;
  const isToday = (t: TaskRow) => !!due(t) && due(t)! >= today && due(t)! < tomorrow;
  const isWeek = (t: TaskRow) => !!due(t) && due(t)! >= today && due(t)! < weekEnd;

  const open = all.filter((t) => !t.done);
  const doneWeek = all.filter((t) => t.done && t.completedAt && new Date(t.completedAt) >= weekAgo);

  const stats: { k: Stat; n: number; l: string; hot?: boolean }[] = [
    { k: "overdue", n: open.filter(isOverdue).length, l: "Overdue", hot: true },
    { k: "today", n: open.filter(isToday).length, l: "Today" },
    { k: "week", n: open.filter(isWeek).length, l: "This week" },
    { k: "high", n: open.filter((t) => t.priority === 1).length, l: "High priority", hot: true },
  ];

  const text = q.trim().toLowerCase();
  const matches = (t: TaskRow) =>
    (!text || `${t.title} ${t.details ?? ""} ${t.contactName ?? ""} ${t.otherLabel ?? ""}`.toLowerCase().includes(text)) &&
    (chip === "all" ||
      (chip === "p1" && t.priority === 1) ||
      (chip === "p2" && t.priority === 2) ||
      (chip === "p3" && t.priority === 3) ||
      (chip === "contact" && !!t.contactId) ||
      (chip === "files" && t.files.length > 0)) &&
    (stat === "none" ||
      (stat === "overdue" && isOverdue(t)) ||
      (stat === "today" && isToday(t)) ||
      (stat === "week" && isWeek(t)) ||
      (stat === "high" && t.priority === 1));

  const dueMs = (t: TaskRow) => (t.dueAt ? new Date(t.dueAt).getTime() : Number.MAX_SAFE_INTEGER);
  const sorted = open.filter(matches).sort((a, b) =>
    sort === "priority"
      ? a.priority - b.priority || dueMs(a) - dueMs(b)
      : sort === "newest"
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : dueMs(a) - dueMs(b) || a.priority - b.priority,
  );

  const groups: { key: string; label: string; red?: boolean; items: TaskRow[] }[] = (() => {
    if (group === "none") return [{ key: "all", label: "", items: sorted }];
    if (group === "priority") return [1, 2, 3].map((p) => ({ key: `p${p}`, label: P[p].l, items: sorted.filter((t) => t.priority === p) }));
    if (group === "contact") {
      const m = new Map<string, TaskRow[]>();
      for (const t of sorted) {
        const k = t.contactName ?? t.otherLabel ?? "Not about anyone";
        m.set(k, [...(m.get(k) ?? []), t]);
      }
      return [...m.entries()].map(([k, items]) => ({ key: k, label: k, items }));
    }
    return [
      { key: "o", label: "⚠ Overdue", red: true, items: sorted.filter(isOverdue) },
      { key: "t", label: "Today", items: sorted.filter(isToday) },
      { key: "w", label: "This week", items: sorted.filter((t) => isWeek(t) && !isToday(t)) },
      { key: "l", label: "Later", items: sorted.filter((t) => !!due(t) && due(t)! >= weekEnd) },
      { key: "n", label: "No date", items: sorted.filter((t) => !t.dueAt) },
    ];
  })().filter((g) => g.items.length > 0);

  async function change(t: TaskRow, patch: { priority?: number; dueAt?: Date | null }) {
    setMenu(null);
    setErr(null);
    setBusy(t.id);
    setLocal((x) => ({ ...x, [t.id]: { ...x[t.id], ...patch } }));
    const dueAt = patch.dueAt !== undefined ? patch.dueAt : t.dueAt;
    const r = await updateTask({
      id: t.id,
      title: t.title,
      contactId: t.contactId ?? "",
      listingId: t.listingId ?? "",
      dueAt: dueAt ? new Date(dueAt).toISOString() : "",
      priority: patch.priority ?? t.priority,
    }).catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      setLocal((x) => ({ ...x, [t.id]: {} }));
      setErr(r && !r.ok ? r.error : "Could not reach the server.");
      return;
    }
    router.refresh();
  }
  async function toggleDone(t: TaskRow) {
    setBusy(t.id);
    setLocal((x) => ({ ...x, [t.id]: { ...x[t.id], done: !t.done, completedAt: t.done ? null : new Date() } }));
    const r = await (t.done ? reopenTask({ id: t.id }) : completeTask({ id: t.id })).catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      setLocal((x) => ({ ...x, [t.id]: {} }));
      setErr(r && !r.ok ? r.error : "Could not reach the server.");
      return;
    }
    router.refresh();
  }
  const at9 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9);
  const nextMonday = () => {
    let d = addDays(today, 1);
    while (d.getDay() !== 1) d = addDays(d, 1);
    return at9(d);
  };

  const chipCls = (on: boolean) =>
    `rounded-full border px-3 min-h-8 text-[13px] font-semibold ${on ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "surface-2 text-2 hover:surface-3"}`;
  const sel = "rounded-[10px] border surface-2 px-2.5 min-h-9 text-[13px] font-semibold";

  function Badge({ p }: { p: number }) {
    return <span className={`shrink-0 rounded-full px-2 text-[11.5px] font-bold ${P[p]?.cls ?? P[2].cls}`}>{P[p]?.l ?? "Normal"}</span>;
  }

  function Menu({ t }: { t: TaskRow }) {
    const openIt = menu === t.id;
    const item = "block w-full text-left rounded-lg px-2.5 py-1.5 text-[13.5px] hover:surface-3";
    return (
      <div className="relative shrink-0">
        <button type="button" aria-label="Task options" aria-expanded={openIt} onClick={() => setMenu(openIt ? null : t.id)} className="grid place-items-center w-8 h-8 rounded-[9px] border surface-2 hover:surface-3">
          <MoreHorizontal size={16} />
        </button>
        {openIt && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div className="absolute right-0 top-9 z-50 w-[230px] rounded-xl border surface-2 shadow-xl p-1.5">
              <p className="px-2.5 pt-1 text-[11.5px] text-3">Priority</p>
              <div className="flex gap-1 px-1.5 py-1">
                {[1, 2, 3].map((p) => (
                  <button key={p} type="button" onClick={() => change(t, { priority: p })} className={`flex-1 rounded-lg py-1 text-[12px] font-bold ${P[p].cls} ${t.priority === p ? "ring-2 ring-[var(--text)]/40" : ""}`}>
                    {P[p].l}
                  </button>
                ))}
              </div>
              <div className="border-t my-1" />
              <p className="px-2.5 pt-1 text-[11.5px] text-3">Move to</p>
              <button type="button" className={item} onClick={() => change(t, { dueAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17) })}>📅 Today</button>
              <button type="button" className={item} onClick={() => change(t, { dueAt: at9(tomorrow) })}>📅 Tomorrow</button>
              <button type="button" className={item} onClick={() => change(t, { dueAt: nextMonday() })}>📅 Next Monday</button>
              <label className={`${item} cursor-pointer`}>
                📅 Pick a date…
                <input
                  type="date"
                  className="block mt-1 w-full rounded-md border px-2 min-h-8 bg-transparent text-[13px]"
                  onChange={(e) => e.target.value && change(t, { dueAt: new Date(`${e.target.value}T09:00:00`) })}
                />
              </label>
              <button type="button" className={item} onClick={() => change(t, { dueAt: null })}>No date</button>
              <div className="border-t my-1" />
              <div className="flex gap-1.5 px-1.5 py-1">
                <EditTaskButton
                  task={{ id: t.id, title: t.title, contactId: t.contactId, listingId: t.listingId, dueAt: t.dueAt, priority: t.priority, details: t.details, otherLabel: t.otherLabel }}
                  contacts={contacts}
                  listings={listings}
                />
                <DeleteTaskButton id={t.id} />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  function Row({ t }: { t: TaskRow }) {
    const d = due(t);
    return (
      <div className={`flex items-center gap-3 surface-2 border rounded-xl px-3 py-2 ${t.done ? "opacity-60" : ""}`}>
        <button
          type="button"
          disabled={busy === t.id}
          onClick={() => toggleDone(t)}
          aria-label={t.done ? "Put it back on the list" : "Mark done"}
          title={t.done ? "Put it back on the list" : "Mark done"}
          className={`shrink-0 grid place-items-center w-[22px] h-[22px] rounded-full border-2 ${t.done ? "bg-[#2E7D32] border-[#2E7D32] text-white" : "border-[#B9C1CF] hover:border-[#2E7D32] hover:text-[#2E7D32] text-transparent"}`}
        >
          <Check size={13} strokeWidth={3} />
        </button>
        {!t.done && <Badge p={t.priority} />}
        <div className="min-w-0 flex-1">
          <b className={`block text-[14px] truncate ${t.done ? "line-through font-semibold" : ""}`}>{t.title}</b>
          <span className="block text-2 text-[12.5px] truncate">
            {t.contactId ? (
              <Link href={`/contacts/${t.contactId}`} className="hover:underline underline-offset-2">
                {t.contactName ?? "Unnamed contact"}
              </Link>
            ) : null}
            {t.propertyId && (
              <>
                {t.contactId ? " · " : ""}
                <Link href={`/properties/${t.propertyId}`} className="hover:underline underline-offset-2">🏠 {t.propertyLabel || "Property"}</Link>
              </>
            )}
            {t.otherLabel && <>{t.contactId || t.propertyId ? " · " : ""}{t.otherLabel}</>}
            {t.details && <>{t.contactId || t.otherLabel ? " · " : ""}{t.details}</>}
          </span>
        </div>
        {t.files.length > 0 && (
          <span className="shrink-0 hidden sm:flex gap-1 max-w-[220px] overflow-hidden">
            {t.files.map((f) => (
              <a key={f.id} href={`/api/task-files/${f.id}`} target="_blank" rel="noreferrer" title={f.name} className="inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[11.5px] text-2 hover:surface-3 max-w-[140px] truncate">
                <Paperclip size={11} className="shrink-0" /> <span className="truncate">{f.name}</span>
              </a>
            ))}
          </span>
        )}
        <span className={`shrink-0 w-[92px] text-right text-[12.5px] font-semibold ${!t.done && isOverdue(t) ? "text-[#A12A12]" : "text-2"}`}>
          {t.done ? (t.completedAt ? `done ${fmtDue(new Date(t.completedAt))}` : "done") : !d ? "No date" : isOverdue(t) ? `${Math.max(1, Math.round((today.getTime() - dayStart(d).getTime()) / 864e5))}d overdue` : isToday(t) ? "today" : fmtDue(d)}
        </span>
        {t.done ? <DeleteTaskButton id={t.id} /> : <Menu t={t} />}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-4">
        {stats.map((s) => (
          <button key={s.k} type="button" aria-pressed={stat === s.k} onClick={() => setStat(stat === s.k ? "none" : s.k)} className={`text-left surface-2 border rounded-2xl px-3.5 py-2.5 ${stat === s.k ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : ""}`}>
            <b className={`block text-[24px] leading-tight ${s.hot && s.n > 0 ? "text-[var(--accent)]" : ""}`}>{s.n}</b>
            <span className="text-2 text-[13px] font-semibold">{s.l}</span>
          </button>
        ))}
        <button type="button" onClick={() => setShowDone(!showDone)} className={`text-left surface-2 border rounded-2xl px-3.5 py-2.5 ${showDone ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : ""}`}>
          <b className="block text-[24px] leading-tight text-[#2E7D32]">{doneWeek.length}</b>
          <span className="text-2 text-[13px] font-semibold">Done this week ✓</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <label className="flex-1 min-w-[220px] flex items-center gap-2 rounded-[10px] border surface-2 px-3 min-h-9">
          <Search size={15} className="text-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks, notes, contacts…" className="flex-1 bg-transparent outline-none text-[14px]" />
        </label>
        <select value={group} onChange={(e) => { setGroup(e.target.value as Group); remember({ group: e.target.value }); }} className={sel} aria-label="Group">
          <option value="due">Group: by due date</option>
          <option value="priority">Group: by priority</option>
          <option value="contact">Group: by contact</option>
          <option value="none">No groups</option>
        </select>
        <select value={sort} onChange={(e) => { setSort(e.target.value as Sort); remember({ sort: e.target.value }); }} className={sel} aria-label="Sort">
          <option value="due">Sort: due date</option>
          <option value="priority">Sort: priority</option>
          <option value="newest">Sort: newest</option>
        </select>
        <div className="flex gap-1">
          <button type="button" aria-pressed={view === "list"} onClick={() => { setView("list"); remember({ view: "list" }); }} className={`${sel} inline-flex items-center gap-1 ${view === "list" ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}>
            <LayoutList size={15} /> List
          </button>
          <button type="button" aria-pressed={view === "board"} onClick={() => { setView("board"); remember({ view: "board" }); }} className={`${sel} inline-flex items-center gap-1 ${view === "board" ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}>
            <Columns3 size={15} /> Board
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(
          [
            ["all", `All ${open.length}`],
            ["p1", `🔴 High ${open.filter((t) => t.priority === 1).length}`],
            ["p2", `🟡 Normal ${open.filter((t) => t.priority === 2).length}`],
            ["p3", `⚪ Low ${open.filter((t) => t.priority === 3).length}`],
            ["contact", `With a contact ${open.filter((t) => t.contactId).length}`],
            ["files", `With files ${open.filter((t) => t.files.length).length}`],
          ] as [Chip, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={chip === k} onClick={() => setChip(k)} className={chipCls(chip === k)}>
            {l}
          </button>
        ))}
        <button type="button" aria-pressed={showDone} onClick={() => setShowDone(!showDone)} className={chipCls(showDone)}>
          Show done
        </button>
      </div>
      {err && <p className="text-[13px] text-[#b02f2f] mb-2">{err}</p>}

      {view === "list" ? (
        <>
          {groups.length === 0 && <p className="text-center text-2 py-8">{open.length ? "No tasks match." : "Nothing open."}</p>}
          {groups.map((g) => (
            <section key={g.key} className="mb-4">
              {g.label && (
                <h3 className={`mb-1.5 text-[12.5px] font-extrabold uppercase tracking-[0.08em] ${g.red ? "text-[#A12A12]" : "text-2"}`}>
                  {g.label} <span className="normal-case tracking-normal font-semibold">{g.items.length}</span>
                </h3>
              )}
              <div className="space-y-1.5">
                {g.items.map((t) => (
                  <Row key={t.id} t={t} />
                ))}
              </div>
            </section>
          ))}
        </>
      ) : (
        <TaskBoard
          tasks={sorted}
          menu={(t) => <Menu t={t} />}
          info={(t) => ({
            text: [!t.dueAt ? "No date" : isOverdue(t) ? "Overdue" : isToday(t) ? "Today" : fmtDue(new Date(t.dueAt)), t.files.length ? `📎 ${t.files.length}` : ""].filter(Boolean).join(" · "),
            red: isOverdue(t),
            links: [
              ...(t.contactId ? [{ href: `/contacts/${t.contactId}`, label: `👤 ${t.contactName ?? "Contact"}` }] : []),
              ...(t.propertyId ? [{ href: `/properties/${t.propertyId}`, label: `🏠 ${t.propertyLabel || "Property"}` }] : []),
            ],
          })}
          onSaved={onSaved}
          onError={setErr}
        />
      )}

      {showDone && (
        <section className="mt-6">
          <h3 className="mb-1.5 text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-2">
            Done <span className="normal-case tracking-normal font-semibold">{all.filter((t) => t.done).length}</span>
          </h3>
          <div className="space-y-1.5">
            {all
              .filter((t) => t.done && matches({ ...t }))
              .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())
              .map((t) => (
                <Row key={t.id} t={t} />
              ))}
          </div>
        </section>
      )}
      {toast && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[80] w-[min(440px,calc(100%-32px))] rounded-[14px] bg-[#13254A] text-white px-4 py-3 flex items-center gap-3 text-[14.5px] font-semibold shadow-lg">
          <span className="flex-1">{toast.msg}</span>
          <button
            type="button"
            className="text-[#FF8A5C] font-extrabold px-2"
            onClick={async () => {
              const u = toast.undo;
              setToast(null);
              await u();
              router.refresh();
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
