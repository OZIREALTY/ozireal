"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { approveAndSend, editDraft, rejectDraft } from "@/server/actions/approvals";
import { aiRewriteDraft } from "@/server/actions/match-emails";

/**
 * Review and send one email batch (owner-approved preview, 2026-11-20): the people on the
 * left, the real email on the right exactly as it will arrive, approve one or the ticked.
 * Every send goes through approveAndSend, which re-checks consent at that instant.
 */

export type ReviewRow = {
  contactId: string;
  name: string;
  email: string | null;
  itemId: string | null;
  state: string;
  why: string | null;
  subject: string | null;
  body: string | null;
  reviewNote: string | null;
};

const BADGE: Record<string, { label: string; cls: string }> = {
  waiting: { label: "Waiting", cls: "bg-[#fff3d1] text-[#9a6a00] dark:bg-[#3a3016] dark:text-[#f0c14b]" },
  writing: { label: "Being written", cls: "bg-[var(--surface)] text-2" },
  skipped: { label: "Skipped", cls: "bg-[#fde8e8] text-[#b02f2f] dark:bg-[#3a1c1c] dark:text-[#f08a8a]" },
};
const sentBadge = { label: "Sent", cls: "bg-[#e3f4ea] text-[#1f7a4d] dark:bg-[#173527] dark:text-[#5fd39a]" };

export function Review({ campaignName, rows }: { campaignName: string; rows: ReviewRow[] }) {
  const router = useRouter();
  const waiting = rows.filter((r) => r.state === "waiting");
  const [cur, setCur] = React.useState<string>(waiting[0]?.contactId ?? rows[0]?.contactId ?? "");
  const [ticked, setTicked] = React.useState<Set<string>>(new Set(waiting.map((r) => r.contactId)));
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [subj, setSubj] = React.useState("");
  const [body, setBody] = React.useState("");
  const [ask, setAsk] = React.useState("");
  const [asking, setAsking] = React.useState(false);
  const [ver, setVer] = React.useState(0);
  const [progress, setProgress] = React.useState<string | null>(null);

  /**
   * Drafts written after the screen opened arrive ticked too (owner, 2026-11-24), so the
   * button already counts them. Ones the agent unticked stay unticked.
   */
  const seen = React.useRef(new Set(waiting.map((r) => r.contactId)));
  const waitingKey = waiting.map((r) => r.contactId).join(",");
  React.useEffect(() => {
    const fresh = waiting.map((r) => r.contactId).filter((id) => !seen.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => seen.current.add(id));
    setTicked((s) => new Set([...s, ...fresh]));
    setCur((c) => c || fresh[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingKey]);

  const writing = rows.filter((r) => r.state === "writing").length;
  React.useEffect(() => {
    if (!writing) return;
    const t = setInterval(() => router.refresh(), 6000);
    return () => clearInterval(t);
  }, [writing, router]);

  const r = rows.find((x) => x.contactId === cur) ?? rows[0];
  const isSent = (x: ReviewRow) => !["waiting", "writing", "skipped"].includes(x.state);
  const tickedWaiting = waiting.filter((w) => ticked.has(w.contactId));

  function pick(id: string) {
    setCur(id);
    setEditing(false);
    setAsking(false);
    setError(null);
  }

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string } | null>) {
    setBusy(label);
    setError(null);
    try {
      const res = await fn();
      if (res && !res.ok) setError(res.error ?? "That did not work. Try again.");
      return !!res?.ok;
    } catch {
      setError("Could not reach the server. Try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function nextAfter(id: string) {
    const rest = waiting.filter((w) => w.contactId !== id);
    if (rest[0]) setCur(rest[0].contactId);
  }

  async function sendOne() {
    if (!r?.itemId) return;
    const ok = await run("send", () => approveAndSend({ id: r.itemId! }) as Promise<{ ok: boolean; error?: string }>);
    if (ok) {
      nextAfter(r.contactId);
      router.refresh();
    }
  }

  async function sendTicked() {
    setError(null);
    let i = 0;
    const failed: string[] = [];
    for (const w of tickedWaiting) {
      i++;
      setProgress(`Sending ${i} of ${tickedWaiting.length}…`);
      try {
        const res = (await approveAndSend({ id: w.itemId! })) as { ok: boolean; error?: string };
        if (!res.ok) failed.push(`${w.name}: ${res.error}`);
      } catch {
        failed.push(`${w.name}: could not reach the server`);
      }
    }
    setProgress(null);
    if (failed.length) setError(`Not sent: ${failed.join(" · ")}`);
    router.refresh();
  }

  async function save() {
    if (!r?.itemId) return;
    const ok = await run("save", () => editDraft({ id: r.itemId!, subject: subj, body }) as Promise<{ ok: boolean; error?: string }>);
    if (ok) {
      setEditing(false);
      setVer((v) => v + 1);
      router.refresh();
    }
  }

  async function rewrite() {
    if (!r?.itemId || ask.trim().length < 2) return;
    const ok = await run("rewrite", () => aiRewriteDraft({ id: r.itemId!, instruction: ask.trim() }) as Promise<{ ok: boolean; error?: string }>);
    if (ok) {
      setAsking(false);
      setAsk("");
      setVer((v) => v + 1);
      router.refresh();
    }
  }

  async function remove() {
    if (!r?.itemId) return;
    const ok = await run("remove", () => rejectDraft({ id: r.itemId!, reason: `Removed from the ${campaignName.slice(0, 120)} batch` }) as Promise<{ ok: boolean; error?: string }>);
    if (ok) {
      nextAfter(r.contactId);
      router.refresh();
    }
  }

  const sentCount = rows.filter(isSent).length;
  const skipped = rows.filter((x) => x.state === "skipped").length;

  return (
    <>
      <div className="surface-2 border rounded-2xl px-4 py-3 mb-3 flex flex-wrap items-center justify-between gap-3">
        <b className="text-[15px]">
          {waiting.length} waiting{sentCount ? ` · ${sentCount} sent` : ""}{skipped ? ` · ${skipped} skipped` : ""}
          {writing ? ` · ${writing} still being written` : ""}
        </b>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTicked(new Set(waiting.map((w) => w.contactId)))}
            className="rounded-xl border-[1.5px] font-bold px-4 min-h-11 hover:bg-[var(--surface)]"
          >
            Tick all waiting
          </button>
          <button
            type="button"
            disabled={!tickedWaiting.length || !!busy || !!progress}
            onClick={sendTicked}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] text-white font-bold px-4 min-h-11 disabled:opacity-40"
          >
            {progress && <Loader2 size={16} className="animate-spin" />}
            {progress ?? `Approve and send ${tickedWaiting.length} ticked`}
          </button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-xl bg-[#fde8e8] dark:bg-[#3a1c1c] text-[#a12a2a] dark:text-[#f3a3a3] px-3 py-2.5 text-[14px]">{error}</p>}

      <div className="grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-3">
        <div className="surface-2 border rounded-2xl overflow-hidden self-start">
          <div className="px-4 py-2.5 border-b text-[13px] text-2 font-semibold">People in this batch</div>
          {rows.map((x) => {
            const b = isSent(x) ? sentBadge : BADGE[x.state] ?? BADGE.writing;
            const on = x.contactId === r?.contactId;
            return (
              <div
                key={x.contactId}
                className={`flex items-center gap-2.5 px-4 py-2.5 border-b last:border-b-0 ${on ? "bg-[var(--accent)]/[0.07]" : "hover:bg-[var(--surface)]"}`}
                style={on ? { boxShadow: "inset 3px 0 0 var(--accent)" } : undefined}
              >
                {x.state === "waiting" ? (
                  <input
                    type="checkbox"
                    aria-label={`Tick ${x.name}`}
                    checked={ticked.has(x.contactId)}
                    onChange={(e) =>
                      setTicked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(x.contactId);
                        else n.delete(x.contactId);
                        return n;
                      })
                    }
                    className="w-[18px] h-[18px] accent-[var(--accent)] shrink-0"
                  />
                ) : (
                  <span className="w-[18px] shrink-0" />
                )}
                <button type="button" onClick={() => pick(x.contactId)} className="min-w-0 flex-1 text-left">
                  <b className="block truncate">{x.name || x.email || "Unnamed"}</b>
                  <small className="block text-2 text-[12.5px] truncate">{x.subject ?? x.why ?? ""}</small>
                </button>
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap ${b.cls}`}>{b.label}</span>
              </div>
            );
          })}
        </div>

        {r && (
          <div className="surface-2 border rounded-2xl p-4 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2.5 text-[14px]">
              <b>{r.name}</b>
              <span className="text-2">{r.email}</span>
            </div>
            {r.state === "skipped" && (
              <p className="rounded-xl bg-[#fde8e8] dark:bg-[#3a1c1c] text-[#a12a2a] dark:text-[#f3a3a3] px-3 py-2 text-[14px] mb-2.5">
                Not sent: {r.why ?? "blocked at the consent check."}
              </p>
            )}
            {r.state === "writing" && <p className="text-2 py-8 text-center">The AI is still writing this email. It appears here by itself.</p>}
            {r.reviewNote && r.state === "waiting" && (
              <p className="rounded-xl bg-[#fff3d1] dark:bg-[#3a3016] text-[#9a6a00] dark:text-[#f0c14b] px-3 py-2 text-[14px] mb-2.5">Check: {r.reviewNote}</p>
            )}
            {r.itemId && r.state !== "writing" && r.state !== "skipped" && (
              <>
                <div className="bg-[var(--surface)] rounded-xl px-3 py-2 mb-2.5 text-[14px]">
                  Subject: <b>{r.subject}</b>
                </div>
                <div className="bg-[var(--surface)] rounded-2xl p-3">
                  <EmailFrame key={`${r.itemId}-${ver}`} itemId={r.itemId} title={`Email to ${r.name}`} />
                </div>
              </>
            )}

            {r.state === "waiting" && !editing && !asking && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" disabled={!!busy} onClick={sendOne} className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] text-white font-bold px-4 min-h-11 disabled:opacity-40">
                  {busy === "send" && <Loader2 size={16} className="animate-spin" />}
                  Approve and send to {r.name.split(" ")[0] || "them"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubj(r.subject ?? "");
                    setBody((r.body ?? "").replaceAll("**", ""));
                    setEditing(true);
                  }}
                  className="rounded-xl border-[1.5px] font-bold px-4 min-h-11 hover:bg-[var(--surface)]"
                >
                  Edit
                </button>
                <button type="button" onClick={() => setAsking(true)} className="rounded-xl border-[1.5px] font-bold px-4 min-h-11 hover:bg-[var(--surface)]">
                  Rewrite with AI
                </button>
                <button type="button" disabled={!!busy} onClick={remove} className="rounded-xl border-[1.5px] font-bold px-4 min-h-11 text-[#b02f2f] dark:text-[#f08a8a] hover:bg-[var(--surface)]">
                  {busy === "remove" ? "Removing…" : "Remove"}
                </button>
              </div>
            )}

            {editing && (
              <div className="mt-3 space-y-2">
                <label htmlFor="rv-subj" className="block font-bold text-[13.5px]">Subject</label>
                <input id="rv-subj" value={subj} onChange={(e) => setSubj(e.target.value)} className="w-full surface-2 border-[1.5px] rounded-xl px-3 min-h-11" />
                <label htmlFor="rv-body" className="block font-bold text-[13.5px]">Message</label>
                <textarea id="rv-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="w-full surface-2 border-[1.5px] rounded-xl px-3 py-2.5 leading-relaxed" />
                <div className="flex gap-2">
                  <button type="button" disabled={!!busy} onClick={save} className="rounded-xl bg-[var(--accent)] text-white font-bold px-4 min-h-11 disabled:opacity-40">
                    {busy === "save" ? "Saving…" : "Save changes"}
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="rounded-xl border-[1.5px] font-bold px-4 min-h-11">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {asking && (
              <div className="mt-3 space-y-2">
                <label htmlFor="rv-ask" className="block font-bold text-[13.5px]">How should the AI change it?</label>
                <input
                  id="rv-ask"
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  placeholder="e.g. Shorter, and mention the open home on Saturday at 11"
                  className="w-full surface-2 border-[1.5px] rounded-xl px-3 min-h-11"
                />
                <div className="flex gap-2">
                  <button type="button" disabled={!!busy || ask.trim().length < 2} onClick={rewrite} className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] text-white font-bold px-4 min-h-11 disabled:opacity-40">
                    {busy === "rewrite" && <Loader2 size={16} className="animate-spin" />}
                    Rewrite
                  </button>
                  <button type="button" onClick={() => setAsking(false)} className="rounded-xl border-[1.5px] font-bold px-4 min-h-11">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isSent(r) && <p className="mt-3 rounded-xl bg-[#e3f4ea] dark:bg-[#173527] text-[#1f7a4d] dark:text-[#5fd39a] px-3 py-2.5 font-semibold">Sent. Opens, clicks and replies show on the batch page.</p>}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The site refuses to be framed (X-Frame-Options DENY in Caddy), so the email is fetched
 * and drawn with srcDoc, as the Matching board does. sandbox: no scripts, no navigation.
 */
export function EmailFrame({ itemId, title }: { itemId: string; title: string }) {
  const [html, setHtml] = React.useState<string | null>(null);
  const [err, setErr] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    fetch(`/api/email-preview/${itemId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((t) => live && setHtml(t))
      .catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [itemId]);
  if (err) return <p className="text-2 py-8 text-center">The email could not be loaded. Reload the page and try again.</p>;
  if (!html) return <p className="text-2 py-8 text-center">Loading the email…</p>;
  return <iframe title={title} srcDoc={html} sandbox="allow-popups" className="w-full h-[640px] rounded-xl bg-white border-0" />;
}
