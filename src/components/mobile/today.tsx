"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, Check, Mail, Navigation, Sparkles, ChevronRight, Loader2 } from "lucide-react";
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
};

const time = (d: Date) => new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Adelaide" }).format(new Date(d));
const ago = (d: Date) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

const btn = "min-h-[52px] rounded-[14px] px-4 text-[16px] font-bold inline-flex items-center justify-center gap-2 flex-1 basis-[120px]";
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
  const items = data.items.filter((i) => !gone.has(keyOf(i)));

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
    <div className="-mx-4 -mt-4 px-4 pt-3 pb-28 text-[17px] leading-relaxed lg:m-0 lg:p-0 lg:max-w-[1120px] lg:text-[16px]">
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
            <div className="flex flex-wrap gap-2.5 mt-3.5">
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

      <h2 className="mt-6 mb-2.5 text-[13px] font-bold tracking-[0.08em] uppercase text-2">
        Do now <span className="normal-case tracking-normal font-semibold">· {items.length} left</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-center text-2 py-8">All done for now. Nice work.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {items.map((i) => (
            <article key={keyOf(i)} data-kind={i.kind === "emails" ? "emails" : i.kind} className="surface-2 border rounded-2xl p-4">
              {i.kind === "enquiry" && (
                <>
                  <Tag tone="bad">New enquiry · {ago(i.at)}</Tag>
                  <Link href={`/contacts/${i.contactId}`} className="block text-[19px] font-bold mt-2 leading-snug">
                    {i.name}
                  </Link>
                  <p className="text-[16px]">{i.subject}</p>
                  {i.phone && <p className="text-2 text-[14px] mt-1">{i.phone}</p>}
                  <div className="flex flex-wrap gap-2.5 mt-3.5">
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
                  <p className="text-[19px] font-bold mt-2 leading-snug">{i.name}</p>
                  <p className="text-[16px]">Personal emails ready for your OK.</p>
                  <div className="flex flex-wrap gap-2.5 mt-3.5">
                    <Link href={i.propertyId ? `/matching?focus=${i.propertyId}` : "/approvals"} className={primary}>
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
                  <p className="text-[19px] font-bold mt-2 leading-snug">{i.title}</p>
                  {i.name && (
                    <p className="text-[16px]">
                      <Link href={`/contacts/${i.contactId}`} className="underline underline-offset-2">
                        {i.name}
                      </Link>
                      {i.phone && <span className="text-2"> · {i.phone}</span>}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2.5 mt-3.5">
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
            </article>
          ))}
        </div>
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
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-bold ${cls}`}>{children}</span>;
}
