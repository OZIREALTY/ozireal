"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Home, MessageSquareText, Search, Sparkles, Loader2, Users } from "lucide-react";
import type { ComposeData } from "@/server/queries/compose";
import { previewComposeEmail, startComposeEmail } from "@/server/actions/compose-email";

/**
 * The email composer on /campaigns (owner-approved preview, 2026-11-20): four steps,
 * what it is about → who gets it → what it should say → check and send for OK. AI
 * writes one personal draft per person; every draft goes to "Waiting for my OK".
 */

type Tone = "warm" | "short" | "investor";
const TONES: { v: Tone; label: string }[] = [
  { v: "warm", label: "Warm" },
  { v: "short", label: "Short and direct" },
  { v: "investor", label: "Investor numbers" },
];
const STEPS = ["What is it about?", "Who gets it?", "What should it say?", "Check and send for OK"];

export function Composer({ data, startOpen = false }: { data: ComposeData; startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(startOpen);
  const [step, setStep] = React.useState(0);
  const [kind, setKind] = React.useState<"property" | "general">(data.homes.length ? "property" : "general");
  const [listingId, setListingId] = React.useState<string>(data.homes[0]?.listingId ?? "");
  const [groups, setGroups] = React.useState<Set<string>>(new Set(["matched"]));
  const [hand, setHand] = React.useState<Set<string>>(new Set());
  const [removed, setRemoved] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");
  const [tone, setTone] = React.useState<Tone>("warm");
  const [note, setNote] = React.useState("");
  const [name, setName] = React.useState("");
  const [sample, setSample] = React.useState<{ subject: string; html: string; reviewNote: string | null; who: string } | null>(null);
  const [busy, setBusy] = React.useState<"preview" | "send" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ count: number; noConsent: number; held: number } | null>(null);
  const rootRef = React.useRef<HTMLElement>(null);

  const home = kind === "property" ? data.homes.find((h) => h.listingId === listingId) ?? null : null;

  const chosen = React.useMemo(() => {
    const ids = new Set<string>();
    for (const p of data.people) {
      const inGroup =
        (groups.has("matched") && home && p.matches[home.propertyId] !== undefined) ||
        (groups.has("all") && p.canEmail) ||
        [...groups].some((g) => g.startsWith("tag:") && p.tags.includes(g.slice(4)));
      if ((inGroup || hand.has(p.id)) && !removed.has(p.id)) ids.add(p.id);
    }
    return data.people
      .filter((p) => ids.has(p.id))
      .sort((a, b) => (home ? (b.matches[home.propertyId] ?? 0) - (a.matches[home.propertyId] ?? 0) : 0));
  }, [data.people, groups, hand, removed, home]);
  const reachable = chosen.filter((p) => p.canEmail);
  const matchedCount = home ? data.people.filter((p) => p.matches[home.propertyId] !== undefined).length : 0;
  const emailable = data.people.filter((p) => p.canEmail).length;

  const toggleGroup = (g: string) =>
    setGroups((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const found = q.trim().length > 1
    ? data.people.filter((p) => `${p.name} ${p.suburb ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];

  const canNext = [
    kind === "general" || !!home,
    reachable.length > 0,
    kind === "property" || note.trim().length >= 10,
    true,
  ][step];

  function go(n: number) {
    setError(null);
    setStep(n);
  }

  async function makeSample() {
    const who = reachable[0];
    if (!who) return setError("Choose at least one person who can be emailed first.");
    setBusy("preview");
    setError(null);
    try {
      const r = await previewComposeEmail({ listingId: home?.listingId ?? "", tone, note, contactId: who.id });
      if (!r.ok) setError(r.error);
      else setSample({ ...r.data, who: who.name });
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setError(null);
    try {
      const r = await startComposeEmail({
        listingId: home?.listingId ?? "",
        tone,
        note,
        name,
        contactIds: reachable.map((p) => p.id),
      });
      if (!r.ok) setError(r.error);
      else {
        setDone(r.data);
        router.refresh();
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setDone(null);
    setSample(null);
    setNote("");
    setName("");
    setHand(new Set());
    setRemoved(new Set());
    setStep(0);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] text-white text-[15px] font-bold px-5 min-h-12 hover:opacity-90"
      >
        + New email
      </button>
    );
  }

  const opt = (sel: boolean) =>
    `text-left rounded-2xl border-[1.5px] p-3.5 transition ${sel ? "border-[var(--accent)] ring-[3px] ring-[var(--accent)]/15" : "hover:surface-2"}`;
  const pill = (sel: boolean) =>
    `rounded-full border-[1.5px] px-3 min-h-9 text-[13.5px] font-semibold ${sel ? "border-[var(--accent)] bg-[var(--accent)]/10" : "hover:surface-2"}`;

  return (
    <section ref={rootRef} className="surface border rounded-2xl overflow-hidden" aria-label="New email">
      <div className="flex border-b overflow-x-auto" role="tablist">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={i === step}
            onClick={() => (i <= step || canNext ? go(i) : null)}
            className={`flex-1 min-w-[150px] text-left px-4 py-3 border-b-[3px] ${i === step ? "border-[var(--accent)]" : "border-transparent"}`}
          >
            <span className="block text-[11.5px] font-bold uppercase tracking-wider text-2">Step {i + 1}</span>
            <strong className={`text-[15px] ${i === step ? "" : "text-2"}`}>
              {s}
              {i < step && <Check size={14} className="inline ml-1 text-[#1f7a4d]" />}
            </strong>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="p-5 min-w-0 lg:border-r">
          {done ? (
            <div className="space-y-3">
              <p className="text-[19px] font-extrabold">Done. {done.count} personal {done.count === 1 ? "email is" : "emails are"} being written.</p>
              <p className="text-2">
                Each one lands in <b>Waiting for my OK</b> within a minute or two. Nothing is sent until you approve it there.
                {done.noConsent ? ` ${done.noConsent} left out for no email consent.` : ""}
                {done.held ? ` ${done.held} held back: emailed this week or already waiting.` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/approvals" className="inline-flex items-center rounded-xl bg-[var(--accent)] text-white font-bold px-4 min-h-11">
                  Open Waiting for my OK
                </Link>
                <button type="button" onClick={reset} className="rounded-xl border font-bold px-4 min-h-11 hover:surface-2">
                  Write another email
                </button>
              </div>
            </div>
          ) : (
            <>
              {step === 0 && (
                <div>
                  <p className="text-[19px] font-extrabold">What is this email about?</p>
                  <p className="text-2 mb-4">Pick a property to get the visual property card, or write a general message.</p>
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    <button type="button" className={opt(kind === "property")} onClick={() => setKind("property")}>
                      <Home size={18} className="text-[var(--accent)]" />
                      <b className="block mt-1">A property</b>
                      <small className="text-2">New listing, price change, open home</small>
                    </button>
                    <button type="button" className={opt(kind === "general")} onClick={() => setKind("general")}>
                      <MessageSquareText size={18} className="text-[var(--accent)]" />
                      <b className="block mt-1">A general message</b>
                      <small className="text-2">Market update, seasonal note, news</small>
                    </button>
                  </div>
                  {kind === "property" && (
                    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2.5 mt-4 max-h-[420px] overflow-y-auto pr-1">
                      {data.homes.map((h) => (
                        <button key={h.listingId} type="button" className={opt(h.listingId === listingId)} onClick={() => setListingId(h.listingId)}>
                          <b className="block leading-snug">{h.label}</b>
                          <small className="text-2 block mt-1">
                            {[h.beds ? `${h.beds} bed` : null, h.priceDisplay, h.status === "draft" ? "not live yet" : null].filter(Boolean).join(" · ") || "No price wording yet"}
                          </small>
                        </button>
                      ))}
                      {!data.homes.length && <p className="text-2">No live or draft listings yet.</p>}
                    </div>
                  )}
                </div>
              )}

              {step === 1 && (
                <div>
                  <p className="text-[19px] font-extrabold">Who should get it?</p>
                  <p className="text-2 mb-4">Tick one or more groups, and add anyone by name. Anyone without email consent is left out automatically.</p>
                  <div className="space-y-2">
                    {home && (
                      <GroupRow checked={groups.has("matched")} onChange={() => toggleGroup("matched")} title="Buyers matched to this property" hint="From Matching, best fit first" n={matchedCount} />
                    )}
                    <GroupRow checked={groups.has("all")} onChange={() => toggleGroup("all")} title="Everyone I can email" hint="Every contact with email consent" n={emailable} />
                  </div>
                  {data.tags.length > 0 && (
                    <>
                      <p className="font-bold text-[13.5px] mt-4 mb-2">By tag</p>
                      <div className="flex flex-wrap gap-1.5">
                        {data.tags.map((t) => (
                          <button key={t.tag} type="button" className={pill(groups.has(`tag:${t.tag}`))} onClick={() => toggleGroup(`tag:${t.tag}`)}>
                            {t.tag} <span className="text-2 font-normal">{t.n}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="font-bold text-[13.5px] mt-4 mb-2">Add someone by name</p>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-3 text-2" />
                    <input
                      id="compose-search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Type a name or suburb"
                      className="w-full surface border-[1.5px] rounded-xl pl-9 pr-3 min-h-11"
                    />
                  </div>
                  {found.length > 0 && (
                    <div className="mt-1.5 border rounded-xl divide-y">
                      {found.map((p) => {
                        const inIt = chosen.some((c) => c.id === p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:surface-2"
                            onClick={() => {
                              if (inIt) setRemoved((s) => new Set(s).add(p.id));
                              else {
                                setHand((s) => new Set(s).add(p.id));
                                setRemoved((s) => {
                                  const n = new Set(s);
                                  n.delete(p.id);
                                  return n;
                                });
                              }
                            }}
                          >
                            <span>
                              {p.name} {p.suburb && <small className="text-2">· {p.suburb}</small>}
                              {!p.canEmail && <small className="text-[#9a6a00]"> · {p.why}</small>}
                            </span>
                            <span className="text-[13px] font-bold text-[var(--accent)]">{inIt ? "Remove" : "Add"}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <Tally n={chosen.length} label="chosen" />
                    <Tally n={chosen.length - reachable.length} label="can't be emailed, left out" warn />
                    <Tally n={reachable.length} label="will get it" />
                  </div>
                  {chosen.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 max-h-40 overflow-y-auto">
                      {chosen.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          title={p.canEmail ? "Remove" : p.why ?? ""}
                          onClick={() => setRemoved((s) => new Set(s).add(p.id))}
                          className={`rounded-full surface-2 px-2.5 py-1 text-[13px] ${p.canEmail ? "" : "line-through text-2"}`}
                        >
                          {p.name} ×
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[13px] text-2 mt-3">
                    Need finer filters (budget, timeline, intent)? Use the{" "}
                    <Link href="/campaigns/new" className="underline underline-offset-2">audience builder</Link>.
                  </p>
                </div>
              )}

              {step === 2 && (
                <div>
                  <p className="text-[19px] font-extrabold">What should it say?</p>
                  <p className="text-2 mb-4">
                    Tell the AI in a line or two. It writes a separate email for each person, with their first name and what they told you.
                  </p>
                  <p className="font-bold text-[13.5px] mb-2">Tone</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TONES.map((t) => (
                      <button key={t.v} type="button" className={pill(tone === t.v)} onClick={() => setTone(t.v)}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <label htmlFor="compose-note" className="block font-bold text-[13.5px] mt-4 mb-2">
                    {home ? "Anything to mention? (optional)" : "What is the email about?"}
                  </label>
                  <textarea
                    id="compose-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={5}
                    placeholder={
                      home
                        ? "e.g. Open home this Saturday 11 to 11:30. Only 3 left in the release."
                        : "e.g. Adelaide's spring market update: more listings, buyers still active. Offer a free appraisal."
                    }
                    className="w-full surface border-[1.5px] rounded-xl px-3 py-2.5 leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={makeSample}
                    disabled={busy !== null || !canNext}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border-[1.5px] font-bold px-4 min-h-11 hover:surface-2 disabled:opacity-50"
                  >
                    {busy === "preview" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-[var(--accent)]" />}
                    {sample ? "Write the sample again" : "Show me a sample"}
                  </button>
                  {reachable[0] && <p className="text-[13px] text-2 mt-1.5">The sample is written for {reachable[0].name}.</p>}
                </div>
              )}

              {step === 3 && (
                <div>
                  <p className="text-[19px] font-extrabold">Check and send for your OK</p>
                  <p className="text-2 mb-4">This writes one email per person and puts them in <b>Waiting for my OK</b>. You can read, edit or remove any of them there.</p>
                  <ul className="space-y-2">
                    <Li><b>{reachable.length} {reachable.length === 1 ? "person" : "people"}</b> will get it{chosen.length > reachable.length ? `. ${chosen.length - reachable.length} left out: no email consent or address.` : "."}</Li>
                    <Li>About: <b>{home ? home.label : "a general message"}</b> · tone: {TONES.find((t) => t.v === tone)?.label}</Li>
                    <Li>Unsubscribe link and agency details are added to every email.</Li>
                    <Li>Consent is checked again at the moment of sending. Anyone emailed this week is held back.</Li>
                  </ul>
                  <label htmlFor="compose-name" className="block font-bold text-[13.5px] mt-4 mb-2">Name for your list (optional)</label>
                  <input
                    id="compose-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={home ? home.label : "e.g. Spring market update"}
                    className="w-full surface border-[1.5px] rounded-xl px-3 min-h-11"
                  />
                </div>
              )}

              {error && <p className="mt-4 rounded-xl bg-[#fde8e8] dark:bg-[#3a1c1c] text-[#a12a2a] dark:text-[#f3a3a3] px-3 py-2.5 text-[14px]">{error}</p>}

              <div className="flex flex-wrap justify-between gap-2 mt-6">
                <div className="flex gap-2">
                  {step > 0 && (
                    <button type="button" onClick={() => go(step - 1)} className="rounded-xl border font-bold px-4 min-h-11 hover:surface-2">
                      Back
                    </button>
                  )}
                  <button type="button" onClick={() => setOpen(false)} className="rounded-xl font-semibold text-2 px-3 min-h-11 hover:surface-2">
                    Close
                  </button>
                </div>
                {step < 3 ? (
                  <button
                    type="button"
                    disabled={!canNext}
                    onClick={() => go(step + 1)}
                    className="rounded-xl bg-[var(--accent)] text-white font-bold px-5 min-h-11 disabled:opacity-40"
                  >
                    Next: {STEPS[step + 1]}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null || !reachable.length}
                    onClick={send}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] text-white font-bold px-5 min-h-11 disabled:opacity-40"
                  >
                    {busy === "send" && <Loader2 size={16} className="animate-spin" />}
                    Write {reachable.length} {reachable.length === 1 ? "email" : "emails"} for my OK
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="p-5 surface-2 min-w-0" aria-label="Email preview">
          <p className="text-[12.5px] font-bold uppercase tracking-wider text-2 mb-2">What they will see</p>
          {sample ? (
            <>
              <div className="surface border rounded-xl px-3 py-2 mb-2 text-[13.5px]">
                <b>Esi Dor · Ozi Realty</b> → {sample.who}
                <br />
                {sample.subject}
              </div>
              {sample.reviewNote && <p className="text-[13px] text-[#9a6a00] mb-2">Check: {sample.reviewNote}</p>}
              <iframe title="Sample email" srcDoc={sample.html} sandbox="" className="w-full h-[640px] rounded-xl border bg-white" />
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-5 text-2 text-[14px] leading-relaxed">
              <Users size={18} className="mb-2" />
              {home ? (
                <>The email opens with a personal note to each person, then the <b>{home.label}</b> card: photo, price wording, specs, why it stands out and a button to the listing.</>
              ) : (
                <>A personal note to each person, with your signature and the unsubscribe line.</>
              )}
              <br />
              <br />
              In step 3, press <b>Show me a sample</b> to see a real draft here.
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function GroupRow({ checked, onChange, title, hint, n }: { checked: boolean; onChange: () => void; title: string; hint: string; n: number }) {
  return (
    <label className={`flex items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-2.5 cursor-pointer ${checked ? "border-[var(--accent)]" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="w-[18px] h-[18px] accent-[var(--accent)]" />
      <span className="min-w-0">
        <b className="block">{title}</b>
        <small className="text-2">{hint}</small>
      </span>
      <span className="ml-auto font-extrabold tabular-nums">{n}</span>
    </label>
  );
}

function Tally({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div className="surface-2 rounded-xl px-3 py-2">
      <b className={`block text-[24px] font-extrabold tabular-nums ${warn && n ? "text-[#9a6a00] dark:text-[#f0c14b]" : ""}`}>{n}</b>
      <small className="text-2 text-[12.5px] leading-tight block">{label}</small>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 surface-2 rounded-xl px-3 py-2.5">
      <Check size={16} className="text-[#1f7a4d] mt-0.5 shrink-0" />
      <span>{children}</span>
    </li>
  );
}
