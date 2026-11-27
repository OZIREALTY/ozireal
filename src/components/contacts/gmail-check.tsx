"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { addGmailContacts, applyGmailDetails, refreshGmailContacts, skipGmailItems } from "@/server/actions/gmail-contacts";

/**
 * The Gmail contacts check (owner-approved previews, 2026-11-27): Connect once, Refresh
 * any time (with progress), and four tabs to review. Nothing is written without a click.
 */
type Item = {
  id: string;
  kind: "new" | "duplicate" | "extra";
  status: "open" | "added" | "skipped" | "done";
  name: string;
  emails: string[];
  phones: string[];
  extra: { emails?: string[]; phones?: string[] } | null;
  suggestedRole: string | null;
  roleReason: string | null;
  crmContactId: string | null;
  crmName: string | null;
  crmEmail: string | null;
  crmPhone: string | null;
};
type Totals = { gmail: number; crm: number; new: number; duplicate: number; extra: number } | null;

const ROLES: { v: string; l: string }[] = [
  { v: "buyer", l: "🏠 Buyer" },
  { v: "vendor", l: "🏷️ Vendor" },
  { v: "landlord", l: "🔑 Landlord" },
  { v: "tenant", l: "🧳 Tenant" },
  { v: "investor", l: "📈 Investor" },
  { v: "referrer", l: "🤝 Referrer" },
  { v: "business_vendor", l: "🏪 Business vendor" },
  { v: "developer", l: "🏗️ Developer" },
  { v: "agent", l: "🏢 Agent" },
  { v: "", l: "No role" },
];
const when = (d: Date | string) =>
  new Date(d).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function nextAuto() {
  const d = new Date();
  d.setHours(7, 0, 0, 0);
  do d.setDate(d.getDate() + 1);
  while (d.getDay() !== 1);
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

export function GmailCheck({
  connected,
  running,
  lastRun,
  lastDone,
  items,
}: {
  connected: boolean;
  running: { step: string | null } | null;
  lastRun: { status: string; trigger: string; at: Date; error: string | null } | null;
  lastDone: { at: Date; trigger: string; totals: Totals } | null;
  items: Item[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = React.useState<"new" | "duplicate" | "extra" | "skipped">("new");
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(
    params.get("google") === "connected" ? "✓ Google Contacts connected. Press Refresh from Gmail to run the first check." : params.get("google") === "failed" ? "Google did not connect. Try Connect again." : null,
  );
  const [busy, setBusy] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const isRunning = !!running || started;

  // While a check runs, refresh every 2 s to show its step, then the results.
  React.useEffect(() => {
    if (!isRunning) return;
    const t = window.setInterval(() => router.refresh(), 2000);
    return () => window.clearInterval(t);
  }, [isRunning, router]);
  React.useEffect(() => {
    if (started && !running && lastRun && Date.now() - new Date(lastRun.at).getTime() < 60_000) {
      setStarted(false);
      if (lastRun.status === "done" && lastDone?.totals)
        setNote(`✓ Done: ${lastDone.totals.new} not in the CRM · ${lastDone.totals.duplicate} possible duplicate${lastDone.totals.duplicate === 1 ? "" : "s"} · ${lastDone.totals.extra} with extra details.`);
      if (lastRun.status === "failed") setError(lastRun.error ?? "The check failed.");
    }
  }, [started, running, lastRun, lastDone]);

  async function refresh() {
    setError(null);
    setNote(null);
    setBusy(true);
    const r = await refreshGmailContacts({}).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError(r && !r.ok ? r.error : "Could not reach the server.");
    setStarted(true);
    router.refresh();
  }

  const open = items.filter((i) => i.status === "open");
  const lists = {
    new: open.filter((i) => i.kind === "new"),
    duplicate: open.filter((i) => i.kind === "duplicate"),
    extra: open.filter((i) => i.kind === "extra"),
    skipped: items.filter((i) => i.status === "skipped"),
  };

  const btn = "rounded-[10px] px-3.5 min-h-9 text-[13.5px] font-bold inline-flex items-center gap-1.5";
  const tabCls = (on: boolean) =>
    `rounded-full border px-3.5 min-h-9 text-[13.5px] font-semibold ${on ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "surface-2 text-2"}`;

  return (
    <div>
      <div className="surface-2 border rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          {connected ? (
            <span className="inline-block rounded-full bg-[#E8F5E9] text-[#1B5E20] dark:bg-[#183A1C] dark:text-[#9BE3A2] px-2.5 py-0.5 text-[12.5px] font-semibold mb-1">✓ Google Contacts connected</span>
          ) : (
            <span className="inline-block rounded-full surface-3 text-2 px-2.5 py-0.5 text-[12.5px] font-semibold mb-1">Not connected yet</span>
          )}
          <p className="text-2 text-[13.5px]">
            {lastDone
              ? `Last checked ${when(lastDone.at)} (${lastDone.trigger === "manual" ? "by you" : "automatic"})${lastDone.totals ? ` · ${lastDone.totals.gmail} Gmail contacts compared with ${lastDone.totals.crm} in the CRM` : ""}`
              : "Not checked yet"}
            {connected && ` · next automatic check around Mon ${nextAuto().replace(/^\w+,?\s*/, "")}`}
          </p>
        </div>
        {connected ? (
          <button type="button" disabled={isRunning || busy} onClick={refresh} className={`${btn} bg-[var(--accent)] text-white min-w-[190px] justify-center disabled:opacity-85`}>
            {isRunning || busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {isRunning ? "Checking…" : "Refresh from Gmail"}
          </button>
        ) : (
          <a href="/api/google-contacts/connect" className={`${btn} bg-[var(--accent)] text-white`}>
            Connect Google Contacts
          </a>
        )}
        {isRunning && (
          <div className="w-full">
            <div className="h-1.5 rounded-full surface-3 overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-[var(--accent)] animate-[gc-bar_1.4s_ease-in-out_infinite]" />
            </div>
            <p className="text-2 text-[12.5px] mt-1">{running?.step ?? "Starting…"}</p>
          </div>
        )}
      </div>
      <style>{`@keyframes gc-bar{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
      {note && <p className="mb-3 rounded-xl bg-[#E8F5E9] text-[#1B5E20] dark:bg-[#183A1C] dark:text-[#9BE3A2] px-3.5 py-2.5 text-[13.5px] font-semibold">{note}</p>}
      {error && <p className="mb-3 text-[13.5px] text-[#b02f2f]">{error}</p>}

      <div className="flex flex-wrap gap-1.5 mb-3">
        <button type="button" className={tabCls(tab === "new")} onClick={() => setTab("new")}>Not in the CRM {lists.new.length}</button>
        <button type="button" className={tabCls(tab === "duplicate")} onClick={() => setTab("duplicate")}>Possible duplicates {lists.duplicate.length}</button>
        <button type="button" className={tabCls(tab === "extra")} onClick={() => setTab("extra")}>Extra details {lists.extra.length}</button>
        <button type="button" className={tabCls(tab === "skipped")} onClick={() => setTab("skipped")}>Skipped {lists.skipped.length}</button>
      </div>

      {tab === "new" && <NewList items={lists.new} onError={setError} />}
      {tab === "duplicate" && <PairList items={lists.duplicate} kind="duplicate" onError={setError} />}
      {tab === "extra" && <PairList items={lists.extra} kind="extra" onError={setError} />}
      {tab === "skipped" && <SkippedList items={lists.skipped} onError={setError} />}
    </div>
  );
}

function NewList({ items, onError }: { items: Item[]; onError: (e: string | null) => void }) {
  const router = useRouter();
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set(items.filter((i) => i.suggestedRole !== "not_client").map((i) => i.id)));
  const [roles, setRoles] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const roleOf = (i: Item) => roles[i.id] ?? (i.suggestedRole && ROLES.some((r) => r.v === i.suggestedRole) ? i.suggestedRole : "");
  const chosen = items.filter((i) => ticked.has(i.id));

  async function add() {
    setBusy(true);
    onError(null);
    const r = await addGmailContacts({ items: chosen.map((i) => ({ id: i.id, role: roleOf(i) as never })) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return onError(r && !r.ok ? r.error : "Could not reach the server.");
    router.refresh();
  }
  async function skip(ids: string[]) {
    const r = await skipGmailItems({ ids }).catch(() => null);
    if (!r?.ok) return onError(r && !r.ok ? r.error : "Could not reach the server.");
    router.refresh();
  }

  if (!items.length) return <p className="text-center text-2 py-10">Nobody from Gmail is missing from the CRM.</p>;
  return (
    <>
      <div className="space-y-1.5">
        {items.map((i) => (
          <div key={i.id} className="surface-2 border rounded-xl px-3 py-2.5 grid grid-cols-[18px_minmax(0,1fr)_170px] lg:grid-cols-[18px_minmax(0,1.1fr)_190px_minmax(0,1.6fr)_auto] gap-x-3 gap-y-1.5 items-start">
            <input
              type="checkbox"
              aria-label={`Add ${i.name}`}
              checked={ticked.has(i.id)}
              onChange={(e) => {
                const n = new Set(ticked);
                if (e.target.checked) n.add(i.id);
                else n.delete(i.id);
                setTicked(n);
              }}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <div className="min-w-0 [&_span]:break-all">
              <b className="block text-[14px]">{i.name}</b>
              <span className="text-2 text-[12.5px]">{[i.emails[0], i.phones[0]].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="min-w-0 [&_select]:w-full">
              <select
                value={roleOf(i)}
                onChange={(e) => setRoles({ ...roles, [i.id]: e.target.value })}
                aria-label="Role"
                className="rounded-[9px] border surface-2 px-2 min-h-8 text-[13px]"
              >
                {ROLES.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.l}
                  </option>
                ))}
              </select>
              {i.suggestedRole === "not_client" && <span className="block mt-1 text-[11.5px] font-bold text-3">AI: not a client</span>}
            </div>
            <p className="col-start-2 col-span-2 lg:col-start-auto lg:col-span-1 text-2 text-[12.5px] leading-snug">
              {i.suggestedRole == null ? "Role not suggested yet (next check)." : i.roleReason || (i.suggestedRole === "unknown" ? "No emails that show a role." : "")}
            </p>
            <button type="button" onClick={() => skip([i.id])} className="col-start-3 lg:col-start-auto justify-self-end text-2 text-[12.5px] font-semibold hover:underline">
              Skip
            </button>
          </div>
        ))}
      </div>
      <div className="dock-bar mt-3 rounded-[14px] bg-[#13254A] text-white px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
        <span className="text-[14px]">
          {chosen.length} ticked: added with their role and the agency's standing consent.
        </span>
        <button type="button" disabled={!chosen.length || busy} onClick={add} className="ml-auto rounded-[10px] bg-[var(--accent)] px-4 min-h-9 font-bold text-[14px] inline-flex items-center gap-1.5 disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" />}Add {chosen.length} to the CRM
        </button>
      </div>
    </>
  );
}

function PairList({ items, kind, onError }: { items: Item[]; kind: "duplicate" | "extra"; onError: (e: string | null) => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [roles, setRoles] = React.useState<Record<string, string>>({});
  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: string } | null>) {
    setBusy(id);
    onError(null);
    const r = await fn().catch(() => null);
    setBusy(null);
    if (!r?.ok) return onError(r && "error" in r && r.error ? r.error : "Could not reach the server.");
    router.refresh();
  }
  if (!items.length)
    return <p className="text-center text-2 py-10">{kind === "duplicate" ? "No possible duplicates." : "No extra details to add."}</p>;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.id} className="surface-2 border rounded-xl p-3 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-center">
          <div>
            <b className="text-[14px]">{i.name}</b> <span className="text-3 text-[12px]">(Gmail)</span>
            <span className="block text-2 text-[12.5px]">
              {kind === "extra"
                ? `Has ${[...(i.extra?.emails ?? []), ...(i.extra?.phones ?? [])].join(", ")}`
                : [...i.emails, ...i.phones].join(" · ")}
            </span>
          </div>
          <div>
            {i.crmContactId ? (
              <Link href={`/contacts/${i.crmContactId}`} className="font-bold text-[14px] hover:underline underline-offset-2">
                {i.crmName}
              </Link>
            ) : (
              <b>{i.crmName}</b>
            )}{" "}
            <span className="text-3 text-[12px]">(CRM)</span>
            <span className="block text-2 text-[12.5px]">{[i.crmEmail, i.crmPhone].filter(Boolean).join(" · ") || "no email or phone"}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={busy === i.id} onClick={() => run(i.id, () => applyGmailDetails({ id: i.id }))} className="rounded-[10px] bg-[var(--accent)] text-white px-3 min-h-9 text-[13px] font-bold">
              {kind === "duplicate" ? "Same person: add details" : "Add to the CRM record"}
            </button>
            {kind === "duplicate" && (
              <select value={roles[i.id] ?? ""} onChange={(e) => setRoles({ ...roles, [i.id]: e.target.value })} aria-label="Role if added as new" className="rounded-[9px] border surface-2 px-2 min-h-9 text-[13px]">
                {ROLES.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.l}
                  </option>
                ))}
              </select>
            )}
            {kind === "duplicate" && (
              <button type="button" disabled={busy === i.id} onClick={() => run(i.id, () => addGmailContacts({ items: [{ id: i.id, role: (roles[i.id] ?? "") as never }] }))} className="rounded-[10px] border surface-2 px-3 min-h-9 text-[13px] font-bold">
                Different people: add new
              </button>
            )}
            <button type="button" disabled={busy === i.id} onClick={() => run(i.id, () => skipGmailItems({ ids: [i.id] }))} className="px-2 min-h-9 text-[13px] font-semibold text-2">
              Skip
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SkippedList({ items, onError }: { items: Item[]; onError: (e: string | null) => void }) {
  const router = useRouter();
  if (!items.length) return <p className="text-center text-2 py-10">Nothing skipped.</p>;
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div key={i.id} className="surface-2 border rounded-xl px-3 py-2 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <b className="text-[14px]">{i.name}</b>
            <span className="block text-2 text-[12.5px] truncate">{[...i.emails, ...i.phones].join(" · ")}</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              const r = await skipGmailItems({ ids: [i.id], undo: true }).catch(() => null);
              if (!r?.ok) return onError("Could not reach the server.");
              router.refresh();
            }}
            className="rounded-[10px] border surface-2 px-3 min-h-8 text-[13px] font-semibold"
          >
            Bring back
          </button>
        </div>
      ))}
    </div>
  );
}
