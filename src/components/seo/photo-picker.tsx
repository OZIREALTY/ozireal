"use client";

import * as React from "react";
import { Check, Loader2, Search, X } from "lucide-react";

/**
 * Choose a free Pixabay cover (owner-approved preview, 2026-11-25). Six photos per
 * page; the chosen one is copied into our own storage by /api/blog-photos.
 */
type Photo = { id: number; thumb: string; user: string; tags: string };

/** Search words from the post: place names find nothing useful in a stock library. */
export function photoQuery(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/\b(adelaide|south australia|sa|australia|ozi realty|in|for|the|a|an|of|your|to|and|how|what|why|guide|\d{4})\b/g, " ")
      .replace(/[^a-z\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 4)
      .join(" ") || "house"
  );
}

export function PhotoPicker({
  initial,
  onPick,
  onClose,
}: {
  initial: string;
  onPick: (r: { url: string; credit: string; tags: string }) => void;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState(initial);
  const [page, setPage] = React.useState(1);
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [more, setMore] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [chosen, setChosen] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function search(words: string, p: number) {
    setLoading(true);
    setError(null);
    setChosen(null);
    try {
      const r = await fetch(`/api/blog-photos?q=${encodeURIComponent(words)}&page=${p}`);
      const j = await r.json();
      if (!r.ok) return setError(j.error ?? "Photo search failed.");
      setPhotos(j.photos);
      setMore(j.more);
      setPage(p);
      if (!j.photos.length) setError("No photos for those words. Try simpler ones, e.g. house keys.");
    } catch {
      setError("Photo search failed. Check the connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void search(initial, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function use() {
    if (chosen == null) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/blog-photos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: chosen }) });
      const j = await r.json();
      if (!r.ok || !j.url) return setError(j.error ?? "The photo did not save.");
      onPick({ url: j.url, credit: j.credit, tags: j.tags });
    } catch {
      setError("The photo did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="max-w-[900px] mx-auto mt-6 rounded-2xl surface-2 border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start mb-1">
          <b className="text-[15px]">Cover photo: choose one</b>
          <button type="button" onClick={onClose} className="ml-auto" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-2 text-[13px] mb-3">Free photos from Pixabay, searched for the post&apos;s subject. Change the words and search again if none fit.</p>
        <form
          className="flex flex-wrap gap-2 mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            void search(q, 1);
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-[160px] rounded-lg border px-3 min-h-10 bg-transparent" aria-label="Search words" />
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border px-3 min-h-10 font-semibold text-[13px] hover:surface-3">
            <Search size={14} /> Search
          </button>
          {more && (
            <button type="button" onClick={() => search(q, page + 1)} className="rounded-lg border px-3 min-h-10 font-semibold text-[13px] hover:surface-3">
              More photos
            </button>
          )}
        </form>
        {error && <p className="text-[13px] text-[#b02f2f] mb-2">{error}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 min-h-[120px] relative">
          {loading && (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setChosen(p.id)}
              className={`relative text-left rounded-xl overflow-hidden border-2 surface-3 ${chosen === p.id ? "border-[var(--accent)]" : "border-transparent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt={p.tags} className="block w-full aspect-[16/10] object-cover" />
              <span className="block text-[11px] text-3 px-2 py-1 truncate">Photo: {p.user} / Pixabay</span>
              {chosen === p.id && (
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] text-white text-[12px] px-2 py-0.5">
                  <Check size={12} /> Chosen
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 min-h-10 font-semibold text-[13px]">
            Cancel
          </button>
          <button
            type="button"
            disabled={chosen == null || saving}
            onClick={use}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 min-h-10 font-semibold text-[13px] bg-[var(--accent)] text-white disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Use this photo
          </button>
        </div>
      </div>
    </div>
  );
}
