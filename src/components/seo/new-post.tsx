"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { createBlogPost, draftBlogWithAI } from "@/server/actions/blog";
import { LINKABLE_PAGES } from "@/components/public/site-nav";

/**
 * "+ New post" (owner-approved preview, 2026-11-25): blank, from a search people make,
 * or with AI. AI drafting arrives in the next stage, so that option says so rather than
 * pretending; the other two create a draft and open it in the editor.
 */
type Idea = { query: string; impressions: number; position: number };

export function NewPostButton({ ideas }: { ideas: Idea[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"pick" | "search" | "shape" | "writing">("pick");
  const [ai, setAi] = React.useState(false);
  const [audience, setAudience] = React.useState<"home buyers" | "investors" | "sellers" | "landlords" | "overseas buyers">("investors");
  const [length, setLength] = React.useState<600 | 900 | 1400>(900);
  const [services, setServices] = React.useState<string[]>([]);
  const [note, setNote] = React.useState("");
  const [tick, setTick] = React.useState(0);
  const [choice, setChoice] = React.useState<string>("");
  const [own, setOwn] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const topic = choice === "own" ? own.trim() : choice;

  React.useEffect(() => {
    if (step !== "writing") return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [step]);

  async function writeWithAI() {
    setStep("writing");
    setTick(0);
    setError(null);
    try {
      const r = await draftBlogWithAI({ topic, audience, words: length, servicePaths: services, note });
      if (!r.ok) {
        setError(r.error);
        setStep("shape");
        return;
      }
      router.push(`/seo/blog/${r.data.id}?photos=1`);
    } catch {
      setError("The draft could not be finished. Nothing was published; try again.");
      setStep("shape");
    }
  }

  async function start(targetSearch: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await createBlogPost({ title: "", targetSearch });
      if (!r.ok) return setError(r.error);
      router.push(`/seo/blog/${r.data.id}`);
    } catch {
      setError("That didn't reach the CRM. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    if (step === "writing") return;
    setOpen(false);
    setStep("pick");
    setAi(false);
    setChoice("");
    setOwn("");
    setError(null);
  };

  const opt = "w-full text-left flex gap-3 items-start rounded-xl border-[1.5px] p-3.5 hover:border-[var(--accent)] hover:bg-[var(--accent)]/[0.04]";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] text-white text-[13.5px] font-bold px-3.5 min-h-9 hover:opacity-90"
      >
        <Plus size={15} /> New post
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={close}>
          <div className="w-full max-w-[620px] rounded-2xl surface-2 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New post">
            <div className="flex items-center px-5 py-4 border-b">
              <b className="text-[16px]">{step === "pick" ? "New post" : step === "search" ? "New post · What is it about?" : step === "shape" ? "New post · Shape the draft" : "Writing your draft…"}</b>
              <button type="button" onClick={close} aria-label="Close" className="ml-auto text-3 hover:text-[var(--text)]">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              {step === "pick" ? (
                <div className="space-y-2.5">
                  <button type="button" className={opt} disabled={busy} onClick={() => start("")}>
                    <span className="text-[20px]">📝</span>
                    <span className="flex-1">
                      <b className="block">Blank post</b>
                      <span className="text-2 text-[13px]">Start with an empty editor and write it yourself.</span>
                    </span>
                    <span className="rounded-full bg-[#e8f5ee] text-[#1f7a4d] text-[11.5px] font-bold px-2 py-0.5">Free</span>
                  </button>
                  <button type="button" className={opt} onClick={() => { setAi(false); setStep("search"); }}>
                    <span className="text-[20px]">🔎</span>
                    <span className="flex-1">
                      <b className="block">From a search people make</b>
                      <span className="text-2 text-[13px]">Pick a search from Google that you have no post for. You write it; the SEO checklist targets that search.</span>
                    </span>
                    <span className="rounded-full bg-[#e8f5ee] text-[#1f7a4d] text-[11.5px] font-bold px-2 py-0.5">Free</span>
                  </button>
                  <button type="button" className={opt} onClick={() => { setAi(true); setStep("search"); }}>
                    <span className="text-[20px] text-[var(--accent)]">✦</span>
                    <span className="flex-1">
                      <b className="block">Write with AI</b>
                      <span className="text-2 text-[13px]">AI writes a first draft from a search or topic. You check and edit it before anything is published.</span>
                    </span>
                    <span className="rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-[11.5px] font-bold px-2 py-0.5 whitespace-nowrap">≈ A$0.10–0.40</span>
                  </button>
                </div>
              ) : step === "shape" ? (
                <div className="text-[13.5px]">
                  <p className="text-2 mb-3">About: <b className="text-[var(--text)]">{topic}</b></p>
                  <div className="font-semibold text-[13px] mb-1.5">Who is it for?</div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {(["home buyers", "investors", "sellers", "landlords", "overseas buyers"] as const).map((x) => (
                      <button key={x} type="button" onClick={() => setAudience(x)} className={`rounded-full border px-3 min-h-8 text-[13px] capitalize ${audience === x ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] font-semibold" : "hover:surface-3"}`}>{x}</button>
                    ))}
                  </div>
                  <div className="font-semibold text-[13px] mb-1.5">Length</div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {([[600, "Short · 600 words"], [900, "Standard · 900 words"], [1400, "In-depth · 1,400 words"]] as const).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setLength(v)} className={`rounded-full border px-3 min-h-8 text-[13px] ${length === v ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] font-semibold" : "hover:surface-3"}`}>{l}</button>
                    ))}
                  </div>
                  <div className="font-semibold text-[13px] mb-1.5">Link it to your services <span className="text-3 font-normal">(one or more)</span></div>
                  <select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v && !services.includes(v) && services.length < 6) setServices([...services, v]);
                    }}
                    className="w-full rounded-lg border px-3 min-h-10 surface-2"
                    aria-label="Add a service to link"
                  >
                    <option value="">{services.length ? "+ Add another service…" : "Choose one or more services…"}</option>
                    {LINKABLE_PAGES.filter((x) => !services.includes(x.href)).map((x) => (
                      <option key={x.href} value={x.href}>{x.label}</option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-1.5 mt-2 mb-3 min-h-[8px]">
                    {services.map((h) => (
                      <span key={h} className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/[0.07] pl-2.5 pr-1 py-0.5 text-[12.5px] font-semibold">
                        {LINKABLE_PAGES.find((x) => x.href === h)?.label ?? h}
                        <button type="button" aria-label="Remove" title="Remove" onClick={() => setServices(services.filter((x) => x !== h))} className="grid place-items-center w-5 h-5 rounded-full text-3 hover:text-[#b02f2f] hover:surface-3">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {!services.length && <span className="text-3 text-[12px]">None chosen: the AI picks the most relevant one.</span>}
                  </div>
                  <div className="font-semibold text-[13px] mb-1.5">Anything to include? <span className="text-3 font-normal">(optional; any figures you want used go here)</span></div>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="e.g. Mention our free suburb insight report. Keep it practical, no hype." className="w-full rounded-lg border px-3 py-2 surface-2" />
                  <p className="text-3 text-[12px] mt-2">AI uses only facts you give it; it won&#39;t invent figures. Nothing is published until you press Publish.</p>
                  <div className="flex justify-end gap-2 mt-4">
                    <button type="button" onClick={() => setStep("search")} className="rounded-lg border px-3.5 min-h-10 font-semibold hover:surface-3">← Back</button>
                    <button type="button" onClick={writeWithAI} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white px-4 min-h-10 font-bold">✦ Write draft · ≈ A$0.25</button>
                  </div>
                </div>
              ) : step === "writing" ? (
                <div className="text-[13.5px]">
                  <div className="h-2 rounded surface-3 overflow-hidden mb-3"><div className="h-full bg-[var(--accent)] transition-all duration-1000" style={{ width: `${Math.min(95, tick * 1.6)}%` }} /></div>
                  {([["Planned the headings", 2], ["Writing the sections", 10], ["Title, SEO description and checklist", 35]] as const).map(([l, t]) => (
                    <div key={l} className="flex gap-2 py-1">
                      <span className={tick >= t + 8 ? "text-[#1f7a4d] font-bold" : tick >= t ? "text-[#946200] font-bold" : "text-3"}>{tick >= t + 8 ? "✓" : tick >= t ? "●" : "○"}</span>
                      {l}
                    </div>
                  ))}
                  <p className="text-3 text-[12px] mt-3 inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Usually 30–60 seconds. It opens in the editor when it&#39;s ready.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
                    {ideas.map((i) => (
                      <label key={i.query} className={`flex items-center gap-2.5 rounded-lg border-[1.5px] px-3 py-2.5 cursor-pointer ${choice === i.query ? "border-[var(--accent)] bg-[var(--accent)]/[0.05]" : ""}`}>
                        <input type="radio" name="idea" checked={choice === i.query} onChange={() => setChoice(i.query)} className="accent-[var(--accent)]" />
                        <b className="flex-1 text-[13.5px]">{i.query}</b>
                        <span className="text-3 text-[12px] whitespace-nowrap">shown {i.impressions.toLocaleString("en-AU")}× · pos {i.position.toFixed(0)}</span>
                      </label>
                    ))}
                    {!ideas.length && <p className="text-2 text-[13px]">No search ideas yet. Type your own topic below.</p>}
                  </div>
                  <label className={`flex items-center gap-2.5 rounded-lg border-[1.5px] px-3 py-2 ${choice === "own" ? "border-[var(--accent)]" : ""}`}>
                    <input type="radio" name="idea" checked={choice === "own"} onChange={() => setChoice("own")} className="accent-[var(--accent)]" />
                    <input
                      value={own}
                      onChange={(e) => {
                        setOwn(e.target.value);
                        setChoice("own");
                      }}
                      placeholder="Or type your own topic…"
                      className="flex-1 bg-transparent outline-none text-[13.5px] min-h-8"
                    />
                  </label>
                </div>
              )}
              {error && <p className="mt-3 text-[13px] text-[#b02f2f]">{error}</p>}
              {step === "search" && (
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setStep("pick")} className="rounded-lg border px-3.5 min-h-10 font-semibold hover:surface-2">← Back</button>
                  <button
                    type="button"
                    disabled={busy || !(choice && (choice !== "own" || own.trim().length > 2))}
                    onClick={() => (ai ? setStep("shape") : start(topic))}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white px-4 min-h-10 font-bold disabled:opacity-40"
                  >
                    {busy && <Loader2 size={15} className="animate-spin" />} {ai ? "Next →" : "Start writing →"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
