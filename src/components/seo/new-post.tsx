"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { createBlogPost } from "@/server/actions/blog";

/**
 * "+ New post" (owner-approved preview, 2026-11-25): blank, from a search people make,
 * or with AI. AI drafting arrives in the next stage, so that option says so rather than
 * pretending; the other two create a draft and open it in the editor.
 */
type Idea = { query: string; impressions: number; position: number };

export function NewPostButton({ ideas }: { ideas: Idea[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"pick" | "search">("pick");
  const [choice, setChoice] = React.useState<string>("");
  const [own, setOwn] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
    setOpen(false);
    setStep("pick");
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
              <b className="text-[16px]">{step === "pick" ? "New post" : "New post · What is it about?"}</b>
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
                  <button type="button" className={opt} onClick={() => setStep("search")}>
                    <span className="text-[20px]">🔎</span>
                    <span className="flex-1">
                      <b className="block">From a search people make</b>
                      <span className="text-2 text-[13px]">Pick a search from Google that you have no post for. You write it; the SEO checklist targets that search.</span>
                    </span>
                    <span className="rounded-full bg-[#e8f5ee] text-[#1f7a4d] text-[11.5px] font-bold px-2 py-0.5">Free</span>
                  </button>
                  <div className={`${opt} opacity-60 cursor-not-allowed`} aria-disabled>
                    <span className="text-[20px]">✦</span>
                    <span className="flex-1">
                      <b className="block">Write with AI</b>
                      <span className="text-2 text-[13px]">AI writes a first draft for you to edit. Coming in the next update.</span>
                    </span>
                    <span className="rounded-full bg-[var(--surface)] text-2 text-[11.5px] font-bold px-2 py-0.5">Soon</span>
                  </div>
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
                    onClick={() => start(choice === "own" ? own.trim() : choice)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white px-4 min-h-10 font-bold disabled:opacity-40"
                  >
                    {busy && <Loader2 size={15} className="animate-spin" />} Start writing →
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
