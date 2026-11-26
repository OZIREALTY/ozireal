"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, Check, Mail, Navigation, Sparkles, ChevronRight, Loader2, MoreHorizontal, Pin, LayoutGrid, List as ListIcon } from "lucide-react";
import { resetTodayCards, setTodayCard } from "@/server/actions/today";
import { DateApply } from "@/components/ui/date-apply";
import type { TodayBatch, TodayEnquiry, TodayTask } from "@/server/queries/today";
import { completeTask, reopenTask, updateTask } from "@/server/actions/ops";
import { openAssistant } from "@/components/assistant/ask-button";

/**
 * The mobile Today screen (owner-approved preview, 2026-11-19). Thumb-first: one column,
 * 17px body text, 52px buttons, a word on every icon, status in colour AND words, at most
 * two taps per job, Undo after every change. On a computer the same list heads the dashboard, two columns wide.
 */

type Item = TodayEnquiry | TodayBatch | TodayTask;
type Data = {
  next: { id: string; title: string; startsAt: Date; contactId: string | null; name: string | null; phone: string | null } | null;
  counts: { enquiries: number; emails: number; overdue: number; today: number };
  items: Item[];
  prefs: Pref[];
};
type Pref = { key: string; pinned: boolean; hidden: boolean; snoozedUntil: string | null };
type Filter = "all" | "enquiry" | "emails" | "overdue" | "today" | "parked";
type Sort = "urgent" | "new" | "old";

const time = (d: Date) => new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Adelaide" }).format(new Date(d));
const ago = (d: Date) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const FILTERS: { k: Filter; l: string }[] = [
  { k: "all", l: "All" },
  { k: "enquiry", l: "New enquiries" },
  { k: "emails", l: "Emails waiting" },
  { k: "overdue", l: "Overdue" },
  { k: "today", l: "Tasks today" },
  { k: "parked", l: "Hidden & snoozed" },
];
const chip = (on: boolean) =>
  `rounded-full border px-3 min-h-8 text-[13px] font-semibold ${on ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "surface-2 text-2"}`;
const vbtn = (on: boolean) => `grid place-items-center w-9 min-h-9 rounded-[10px] border ${on ? "border-[var(--accent)] text-[var(--accent)]" : "surface-2 text-2"}`;
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

const btn = "min-h-[52px] rounded-[14px] px-4 text-[16px] font-bold inline-flex items-center justify-center gap-2 flex-1 basis-[120px] lg:min-h-9 lg:rounded-[10px] lg:text-[13.5px] lg:px-3 lg:flex-none lg:basis-auto [&_svg]:lg:w-4 [&_svg]:lg:h-4";
const primary = `${btn} bg-[var(--accent)] text-white`;
const ghost = `${btn} surface-3 border text-[var(--text)]`;

export function MobileToday({ data, firstName }: { data: Data; firstName: string }) {
  const router = useRouter();
  const [gone, setGone] = React.useState<Set<string>>(new Set());
  const [toast, setToast] = React.useState<{ msg: string; undo?: () => Promise<void> } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const timer = React.useRef<number | undefined>(undefined);

  const hour = Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: "Australia/Adelaide" }).format(new Date()));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Adelaide" }).format(new Date());

  const keyOf = (i: Item) => (i.kind === "emails" ? `e:${i.campaignId}` : `${i.kind}:${i.id}`);
  // Organising (owner-approved preview, 2026-11-26): filter, order, cards/list, and per
  // card pin / snooze / hide, kept in the CRM so phone and computer agree.
  const [prefs, setPrefs] = React.useState<Record<string, Pref>>(() => Object.fromEntries(data.prefs.map((p) => [p.key, p])));
  React.useEffect(() => setPrefs(Object.fromEntries(data.prefs.map((p) => [p.key, p]))), [data.prefs]);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [sort, setSort] = React.useState<Sort>("urgent");
  const [view, setView] = React.useState<"cards" | "list">("cards");
  const [menu, setMenu] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("today-view") ?? "{}");
      if (v.filter) setFilter(v.filter);
      if (v.sort) setSort(v.sort);
      if (v.view) setView(v.view);
    } catch {}
  }, []);
  const remember = (patch: object) => {
    try {
      localStorage.setItem("today-view", JSON.stringify({ filter, sort, view, ...patch }));
    } catch {}
  };
  const pickFilter = (f: Filter) => { setFilter(f); remember({ filter: f }); };
  const pickSort = (x: Sort) => { setSort(x); remember({ sort: x }); };
  const pickView = (x: "cards" | "list") => { setView(x); remember({ view: x }); };

  const kindKey = (i: Item) => (i.kind === "enquiry" ? `subject:${i.subject}` : null);
  const nowMs = Date.now();
  const isHidden = (i: Item) => !!prefs[keyOf(i)]?.hidden || (kindKey(i) != null && !!prefs[kindKey(i)!]?.hidden);
  const isSnoozed = (i: Item) => {
    const u = prefs[keyOf(i)]?.snoozedUntil;
    return !!u && new Date(u).getTime() > nowMs;
  };
  const isPinned = (i: Item) => !!prefs[keyOf(i)]?.pinned;
  const live = data.items.filter((i) => !gone.has(keyOf(i)));
  const shown = live.filter((i) => !isHidden(i) && !isSnoozed(i));
  const hiddenN = live.filter(isHidden).length;
  const snoozedN = live.filter((i) => !isHidden(i) && isSnoozed(i)).length;
  const match = (i: Item, f: Filter) =>
    f === "all" || (f === "enquiry" && i.kind === "enquiry") || (f === "emails" && i.kind === "emails") ||
    (f === "overdue" && i.kind === "task" && i.overdue) || (f === "today" && i.kind === "task" && !i.overdue);
  const parked = live.filter((i) => isHidden(i) || isSnoozed(i));
  const countOf = (f: Filter) => (f === "parked" ? parked.length : shown.filter((i) => match(i, f)).length);
  const when = (i: Item) => (i.kind === "enquiry" ? new Date(i.at).getTime() : i.kind === "task" && i.dueAt ? new Date(i.dueAt).getTime() : null);
  const items = (filter === "parked" ? parked : shown)
    .map((i, n) => ({ i, n }))
    .filter(({ i }) => filter === "parked" || match(i, filter))
    .sort((a, b) => {
      const pin = Number(isPinned(b.i)) - Number(isPinned(a.i));
      if (pin) return pin;
      if (sort !== "urgent") {
        const x = when(a.i), y = when(b.i);
        if (x != null && y != null && x !== y) return sort === "new" ? y - x : x - y;
      }
      return a.n - b.n;
    })
    .map(({ i }) => i);

  async function savePref(key: string, patch: Partial<Pref>, msg: string) {
    const before = prefs[key];
    const blank: Pref = { key, pinned: false, hidden: false, snoozedUntil: null };
    setPrefs((x) => ({ ...x, [key]: { ...blank, ...x[key], ...patch } }));
    setMenu(null);
    const r = await setTodayCard({ key, ...patch }).catch(() => null);
    if (!r?.ok) {
      setPrefs((x) => ({ ...x, [key]: before ?? blank }));
      return show(r && !r.ok ? r.error : "Could not reach the server.");
    }
    show(msg, async () => {
      const b = before ?? blank;
      await setTodayCard({ key, pinned: b.pinned, hidden: b.hidden, snoozedUntil: b.snoozedUntil }).catch(() => null);
      setPrefs((x) => ({ ...x, [key]: b }));
    });
  }
  async function showAll() {
    const r = await resetTodayCards({}).catch(() => null);
    if (!r?.ok) return show("Could not reach the server.");
    setPrefs((x) => Object.fromEntries(Object.entries(x).map(([k, p]) => [k, { ...p, hidden: false, snoozedUntil: null }])));
    show("Hidden and snoozed cards are back");
  }
  const at = (days: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const nextMonday = () => {
    const d = at(1, 9);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    return d;
  };
  const snooze = (i: Item, d: Date, label: string) => savePref(keyOf(i), { snoozedUntil: d.toISOString() }, `Snoozed until ${label}`);

  const parkedLabel = (i: Item) => {
    if (prefs[keyOf(i)]?.hidden) return "🙈 Hidden";
    if (kindKey(i) && prefs[kindKey(i)!]?.hidden) return "🚫 Hidden with all cards of this kind";
    const u = prefs[keyOf(i)]?.snoozedUntil;
    return u ? `⏰ Snoozed until ${new Date(u).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "";
  };
  async function unpark(i: Item) {
    const kk = kindKey(i);
    if (kk && prefs[kk]?.hidden) await savePref(kk, { hidden: false }, "That kind of card shows again");
    await savePref(keyOf(i), { hidden: false, snoozedUntil: null }, "Card is back");
  }

  function CardMenu({ i, inline = false }: { i: Item; inline?: boolean }) {
    const k = keyOf(i);
    const open = menu === k;
    const late = new Date().getHours() >= 15;
    const item = "block w-full text-left rounded-lg px-2.5 py-2 text-[14.5px] hover:surface-3";
    return (
      <div className={inline ? "relative" : "absolute top-3 right-3 lg:top-2 lg:right-2 z-10"}>
        <button type="button" aria-label="Organise this card" aria-expanded={open} onClick={() => setMenu(open ? null : k)} className="grid place-items-center w-9 h-9 lg:w-8 lg:h-8 rounded-[10px] border surface-2 hover:surface-3">
          <MoreHorizontal size={18} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div className="absolute right-0 top-11 z-50 w-[240px] rounded-xl border surface-2 shadow-xl p-1.5 text-[var(--text)]">
              {(isHidden(i) || isSnoozed(i)) && (
                <>
                  <button type="button" className={`${item} font-bold text-[var(--accent)]`} onClick={() => unpark(i)}>↩ Show it again</button>
                  <div className="border-t my-1" />
                </>
              )}
              <button type="button" className={item} onClick={() => savePref(k, { pinned: !isPinned(i) }, isPinned(i) ? "Unpinned" : "Pinned to the top")}>
                📌 {isPinned(i) ? "Unpin" : "Pin to top"}
              </button>
              <div className="border-t my-1" />
              <p className="px-2.5 pt-1 text-[12px] text-3">Snooze until</p>
              {late ? (
                <button type="button" className={item} onClick={() => { const d = new Date(Date.now() + 3 * 3600e3); snooze(i, d, "in 3 hours"); }}>⏰ In 3 hours</button>
              ) : (
                <button type="button" className={item} onClick={() => snooze(i, at(0, 16), "4 pm")}>⏰ Later today (4 pm)</button>
              )}
              <button type="button" className={item} onClick={() => snooze(i, at(1, 9), "tomorrow 9 am")}>⏰ Tomorrow morning</button>
              <button type="button" className={item} onClick={() => snooze(i, nextMonday(), "Monday 9 am")}>⏰ Next Monday</button>
              <DateApply
                label="⏰ Pick a date…"
                min={new Date(Date.now() + 864e5).toLocaleDateString("en-CA")}
                onApply={(d) => snooze(i, d, d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }))}
              />
              <div className="border-t my-1" />
              {i.kind === "task" ? (
                <button type="button" className={item} onClick={() => { setMenu(null); void done(i); }}>✓ Mark done</button>
              ) : null}
              <button type="button" className={item} onClick={() => savePref(k, { hidden: true }, "Card hidden")}>🙈 Hide this card</button>
              {i.kind === "enquiry" && (
                <button type="button" className={item} onClick={() => savePref(`subject:${i.subject}`, { hidden: true }, `All "${i.subject.slice(0, 40)}" cards hidden`)}>
                  🚫 Hide all “{i.subject.length > 34 ? `${i.subject.slice(0, 34)}…` : i.subject}” cards
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  const body = (i: Item) => (
    <>
              {i.kind === "enquiry" && (
                <>
                  <Tag tone="bad">New enquiry · {ago(i.at)}</Tag>
                  <Link href={`/contacts/${i.contactId}`} className="block text-[19px] lg:text-[15.5px] font-bold mt-2 lg:mt-1.5 leading-snug">
                    {i.name}
                  </Link>
                  <p className="text-[16px] lg:text-[13.5px] lg:text-2">{i.subject}</p>
                  {i.phone && <p className="text-2 text-[14px] lg:text-[13px] mt-1 lg:mt-0">{i.phone}</p>}
                  <div className="flex flex-wrap gap-2.5 lg:gap-2 mt-3.5 lg:mt-2.5">
                    {i.phone && (
                      <a href={tel(i.phone)} className={ghost}>
                        <Phone size={20} /> Call
                      </a>
                    )}
                    <button type="button" className={primary} onClick={() => openAssistant({ send: `Draft a reply to ${i.name}'s latest enquiry, for my approval.` })}>
                      <Sparkles size={20} /> Draft reply
                    </button>
                  </div>
                </>
              )}
              {i.kind === "emails" && (
                <>
                  <Tag tone="info">
                    {i.count} {i.count === 1 ? "email" : "emails"} waiting
                  </Tag>
                  <p className="text-[19px] lg:text-[15.5px] font-bold mt-2 lg:mt-1.5 leading-snug">{i.name}</p>
                  <p className="text-[16px] lg:text-[13.5px] lg:text-2">Personal emails ready for your OK.</p>
                  <div className="flex flex-wrap gap-2.5 lg:gap-2 mt-3.5 lg:mt-2.5">
                    <Link href={i.href} className={primary}>
                      <Mail size={20} /> Review &amp; send <ChevronRight size={18} />
                    </Link>
                  </div>
                </>
              )}
              {i.kind === "task" && (
                <>
                  <Tag tone={i.overdue ? "bad" : "warn"}>
                    {i.overdue ? "Overdue" : i.dueAt ? `Due ${time(i.dueAt)}` : "Today"}
                  </Tag>
                  {i.priority === 1 && <span className="ml-1.5"><Tag tone="bad">🔴 High</Tag></span>}
                  {i.priority === 2 && <span className="ml-1.5"><Tag tone="warn">🟡 Normal</Tag></span>}
                  {i.priority === 3 && <span className="ml-1.5 inline-flex items-center rounded-full px-2.5 py-1 lg:py-0.5 text-[13px] lg:text-[12px] font-bold bg-[#C9D0DD] text-[#25314A]">⚪ Low</span>}
                  <p className="text-[19px] lg:text-[15.5px] font-bold mt-2 lg:mt-1.5 leading-snug">{i.title}</p>
                  {i.name && (
                    <p className="text-[16px] lg:text-[13.5px] lg:text-2">
                      <Link href={`/contacts/${i.contactId}`} className="underline underline-offset-2">
                        {i.name}
                      </Link>
                      {i.phone && <span className="text-2"> · {i.phone}</span>}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2.5 lg:gap-2 mt-3.5 lg:mt-2.5">
                    {i.phone && (
                      <a href={tel(i.phone)} className={ghost} aria-label={`Call ${i.name}`}>
                        <Phone size={20} /> Call
                      </a>
                    )}
                    <button type="button" className={ghost} disabled={busy === i.id} onClick={() => tomorrow(i)}>
                      Tomorrow
                    </button>
                    <button type="button" className={primary} disabled={busy === i.id} onClick={() => done(i)}>
                      {busy === i.id ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} strokeWidth={2.6} />} Done
                    </button>
                  </div>
                </>
              )}
    </>
  );

  function show(msg: string, undo?: () => Promise<void>) {
    window.clearTimeout(timer.current);
    setToast({ msg, undo });
    timer.current = window.setTimeout(() => setToast(null), 5000);
  }

  async function done(t: TodayTask) {
    setBusy(t.id);
    const r = await completeTask({ id: t.id }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return show(r && !r.ok ? r.error : "Could not reach the server.");
    setGone((g) => new Set(g).add(keyOf(t)));
    show("Done", async () => {
      await reopenTask({ id: t.id }).catch(() => null);
      setGone((g) => {
        const n = new Set(g);
        n.delete(keyOf(t));
        return n;
      });
    });
    router.refresh();
  }

  async function tomorrow(t: TodayTask) {
    setBusy(t.id);
    const nineAm = new Date();
    nineAm.setDate(nineAm.getDate() + 1);
    nineAm.setHours(9, 0, 0, 0);
    const r = await updateTask({ id: t.id, title: t.title, contactId: t.contactId ?? "", dueAt: nineAm }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return show(r && !r.ok ? r.error : "Could not reach the server.");
    setGone((g) => new Set(g).add(keyOf(t)));
    show("Moved to tomorrow", async () => {
      await updateTask({ id: t.id, title: t.title, contactId: t.contactId ?? "", dueAt: t.dueAt ?? "" }).catch(() => null);
      setGone((g) => {
        const n = new Set(g);
        n.delete(keyOf(t));
        return n;
      });
    });
    router.refresh();
  }

  const counts = [
    { n: data.counts.enquiries, l: "New enquiries", hot: data.counts.enquiries > 0, jump: "enquiry" },
    { n: data.counts.emails, l: "Emails to approve", hot: false, jump: "emails" },
    { n: data.counts.overdue, l: "Overdue", hot: data.counts.overdue > 0, jump: "task" },
    { n: data.counts.today, l: "Due today", hot: false, jump: "task" },
  ];

  return (
    <div className="-mx-4 -mt-4 px-4 pt-3 pb-2 text-[17px] leading-relaxed lg:m-0 lg:p-0 lg:max-w-[1120px] lg:text-[16px]">
      <header className="flex items-center gap-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-2 text-[14px] font-medium">{today}</p>
          <h1 className="text-[26px] leading-tight font-extrabold text-[var(--text)]">
            {greet}, {firstName}
          </h1>
        </div>
      </header>

      {data.next && (
        <>
          <h2 className="mt-5 mb-2.5 text-[13px] font-bold tracking-[0.08em] uppercase text-2">Next up</h2>
          <section className="rounded-2xl bg-[#13254A] text-white p-4">
            <p className="text-[14px] font-bold tracking-wide text-[#FFB59E]">{time(data.next.startsAt)}</p>
            <p className="text-[20px] font-bold leading-snug mt-0.5">{data.next.title}</p>
            {data.next.name && <p className="text-[#D5DCEB] text-[16px]">with {data.next.name}</p>}
            <div className="flex flex-wrap gap-2.5 lg:gap-2 mt-3.5 lg:mt-2.5">
              {data.next.phone && (
                <a href={tel(data.next.phone)} className={`${btn} bg-white/10 border border-white/25 text-white`}>
                  <Phone size={20} /> Call
                </a>
              )}
              <Link href="/calendar" className={primary}>
                <Navigation size={20} /> Open
              </Link>
            </div>
          </section>
        </>
      )}

      <h2 className="mt-6 mb-2.5 text-[13px] font-bold tracking-[0.08em] uppercase text-2">Today at a glance</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {counts.map((c) => (
          <button
            key={c.l}
            type="button"
            onClick={() => document.querySelector(`[data-kind="${c.jump}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="text-left surface-2 border rounded-2xl p-3.5 min-h-[84px]"
          >
            <b className={`block text-[30px] leading-none font-extrabold ${c.hot ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>{c.n}</b>
            <span className="text-[15px] text-2 font-semibold">{c.l}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 mb-2.5 flex flex-wrap items-center gap-2">
        <h2 className="text-[13px] font-bold tracking-[0.08em] uppercase text-2 mr-1">
          Do now <span className="normal-case tracking-normal font-semibold">· {items.length} left</span>
        </h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.k} type="button" aria-pressed={filter === f.k} onClick={() => pickFilter(f.k)} className={chip(filter === f.k)}>
              {f.l} <span className="opacity-70">{countOf(f.k)}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 ml-auto">
          <select value={sort} onChange={(e) => pickSort(e.target.value as Sort)} aria-label="Order" className="rounded-[10px] border surface-2 px-2 min-h-9 text-[13px] font-semibold">
            <option value="urgent">Most urgent first</option>
            <option value="new">Newest first</option>
            <option value="old">Oldest first</option>
          </select>
          <button type="button" aria-label="Cards" aria-pressed={view === "cards"} onClick={() => pickView("cards")} className={vbtn(view === "cards")}><LayoutGrid size={16} /></button>
          <button type="button" aria-label="List" aria-pressed={view === "list"} onClick={() => pickView("list")} className={vbtn(view === "list")}><ListIcon size={16} /></button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-center text-2 py-8">{filter === "all" ? "All done for now. Nice work." : "Nothing of this kind right now."}</p>
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-2.5">
          {items.map((i) => (
            <article key={keyOf(i)} data-kind={i.kind === "emails" ? "emails" : i.kind} className={`relative surface-2 border rounded-2xl p-4 lg:p-3 lg:pr-12 lg:rounded-xl ${isPinned(i) ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : ""}`}>
              <CardMenu i={i} />
              {filter === "parked" && <p className="text-3 text-[12.5px] font-semibold mb-1">{parkedLabel(i)}</p>}
              {isPinned(i) && <span className="absolute top-[18px] right-14 lg:top-[13px] lg:right-12 inline-flex items-center gap-1 text-[12.5px] font-bold text-[var(--accent)]"><Pin size={13} /> Pinned</span>}
              {body(i)}
            </article>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((i) => (
            <div key={keyOf(i)} data-kind={i.kind === "emails" ? "emails" : i.kind} className={`relative flex items-center gap-3 surface-2 border rounded-xl px-3 py-2 ${isPinned(i) ? "border-[var(--accent)]" : ""}`}>
              <Tag tone={i.kind === "emails" ? "info" : i.kind === "task" && !i.overdue ? "warn" : "bad"}>
                {i.kind === "enquiry" ? "Enquiry" : i.kind === "emails" ? "Email" : i.overdue ? "Overdue" : "Task"}
              </Tag>
              <b className="min-w-0 flex-1 truncate text-[15px]">{isPinned(i) && "📌 "}{i.kind === "task" ? i.title : i.name}</b>
              <span className="hidden sm:block flex-[1.4] min-w-0 truncate text-2 text-[14px]">
                {i.kind === "enquiry" ? `${i.subject} · ${ago(i.at)}` : i.kind === "emails" ? `${i.count} waiting for your OK` : i.name ?? (i.dueAt ? `Due ${time(i.dueAt)}` : "Today")}
              </span>
              {i.kind === "enquiry" ? (
                <button type="button" className="rounded-[9px] bg-[var(--accent)] text-white px-3 min-h-9 text-[13px] font-bold" onClick={() => openAssistant({ send: `Draft a reply to ${i.name}'s latest enquiry, for my approval.` })}>Draft reply</button>
              ) : i.kind === "emails" ? (
                <Link href={i.href} className="rounded-[9px] bg-[var(--accent)] text-white px-3 min-h-9 inline-flex items-center text-[13px] font-bold">Review</Link>
              ) : (
                <button type="button" disabled={busy === i.id} className="rounded-[9px] bg-[var(--accent)] text-white px-3 min-h-9 text-[13px] font-bold" onClick={() => done(i)}>Done</button>
              )}
              <CardMenu i={i} inline />
            </div>
          ))}
        </div>
      )}
      {(snoozedN > 0 || hiddenN > 0) && (
        <p className="mt-3 text-2 text-[14px]">
          {snoozedN > 0 && <>{snoozedN} snoozed</>}
          {snoozedN > 0 && hiddenN > 0 && " · "}
          {hiddenN > 0 && <>{hiddenN} hidden</>} ·{" "}
          <button type="button" onClick={showAll} className="font-bold text-[var(--accent)] hover:underline">Show them</button>
        </p>
      )}

      {toast && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 z-[60] w-[min(408px,calc(100%-32px))] rounded-[14px] bg-[#13254A] text-white px-4 py-3 flex items-center gap-3 text-[16px] font-semibold shadow-lg"
          style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}
        >
          <span className="flex-1">{toast.msg}</span>
          {toast.undo && (
            <button
              type="button"
              className="text-[#FF8A5C] font-extrabold min-h-11 px-2"
              onClick={async () => {
                const u = toast.undo!;
                setToast(null);
                await u();
                router.refresh();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Tag({ tone, children }: { tone: "bad" | "warn" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "bad"
      ? "bg-[#FDE7E2] text-[#A12A12] dark:bg-[#3D1C17] dark:text-[#FF8F78]"
      : tone === "warn"
        ? "bg-[#FFF1DC] text-[#8A4B00] dark:bg-[#3A2C12] dark:text-[#FFC266]"
        : "bg-[#E6EEFC] text-[#0B4FB3] dark:bg-[#182C4F] dark:text-[#8DB5FF]";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 lg:py-0.5 text-[13px] lg:text-[12px] font-bold ${cls}`}>{children}</span>;
}
