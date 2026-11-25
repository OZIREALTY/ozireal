"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import type { BlogEditorPost } from "@/server/queries/blog";
import type { BlogBlock } from "@/db/schema";
import { deleteBlogPost, publishBlogPost, saveBlogPost, unpublishBlogPost } from "@/server/actions/blog";
import { inlineText, plainText } from "@/components/public/inline";

/**
 * The blog editor (owner-approved preview, 2026-11-25). Title, address, cover, body as
 * blocks (paragraph, heading, sub-heading, list), and on the right how it will look in
 * Google, the SEO fields and a live checklist. Saves itself a moment after each change.
 * Publish asks once more, then the post is live in seconds. Nothing publishes by itself.
 *
 * Body text supports **bold** and [words](/page) links, the same two the public page
 * renders (components/public/inline).
 */

const SERVICES = [
  { href: "/buyer-agent-adelaide", label: "Buyer's agent" },
  { href: "/free-property-appraisal-sa", label: "Free property appraisal" },
  { href: "/free-suburb-insight-report", label: "Free suburb insight report" },
  { href: "/property-investment", label: "Property investment" },
  { href: "/manage-property-adelaide", label: "Property management" },
  { href: "/sell-property-house-adelaide", label: "Sell your property" },
  { href: "/new-homes-adelaide", label: "New homes" },
  { href: "/overseas-investment", label: "Overseas investment" },
  { href: "/all-listings", label: "Every listing" },
  { href: "/contact", label: "Contact" },
];
const SERVICE_PATHS = SERVICES.filter((s) => !["/all-listings", "/contact"].includes(s.href)).map((s) => s.href);

type Draft = Omit<BlogEditorPost, "id" | "status" | "publishedAt" | "firstPublishedAt" | "aiGenerated" | "updatedAt">;

const countWords = (blocks: BlogBlock[]) =>
  blocks.reduce((n, b) => n + plainText(`${b.text ?? ""} ${(b.items ?? []).join(" ")}`).split(/\s+/).filter(Boolean).length, 0);

export function BlogEditor({ post, posts }: { post: BlogEditorPost; posts: { slug: string; title: string }[] }) {
  const router = useRouter();
  const [d, setD] = React.useState<Draft>({
    slug: post.slug,
    title: post.title,
    seoTitle: post.seoTitle,
    description: post.description,
    targetSearch: post.targetSearch,
    coverUrl: post.coverUrl,
    coverAlt: post.coverAlt,
    blocks: post.blocks.length ? post.blocks : [{ t: "p", text: "" }],
  });
  const [status, setStatus] = React.useState(post.status);
  const [publishedAt, setPublishedAt] = React.useState(post.publishedAt);
  const locked = !!post.firstPublishedAt || status === "published";
  const [save, setSave] = React.useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [focus, setFocus] = React.useState(0);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const first = React.useRef(true);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setBlock = (i: number, b: Partial<BlogBlock>) => setD((x) => ({ ...x, blocks: x.blocks.map((o, j) => (j === i ? { ...o, ...b } : o)) }));

  // Autosave: a moment after the last change.
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("unsaved");
    const t = setTimeout(async () => {
      setSave("saving");
      try {
        const r = await saveBlogPost({ id: post.id, ...d, slug: locked ? undefined : d.slug || undefined });
        if (r.ok) {
          setSave("saved");
          setSaveError(null);
        } else {
          setSave("error");
          setSaveError(r.error);
        }
      } catch {
        setSave("error");
        setSaveError("Not saved: the CRM could not be reached. It will retry on your next change.");
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  async function uploadCover(f: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/blog-cover", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.url) set("coverUrl", j.url);
      else setSaveError(j.error ?? "The photo did not upload.");
    } finally {
      setUploading(false);
    }
  }

  function insertLink(href: string, label: string) {
    const b = d.blocks[focus];
    if (!b) return;
    const link = `[${label}](${href})`;
    if (b.t === "ul") {
      const items = [...(b.items ?? [])];
      items[items.length - 1] = `${items[items.length - 1] ?? ""} ${link}`.trim();
      setBlock(focus, { items });
    } else setBlock(focus, { text: `${b.text ?? ""} ${link}`.trim() });
  }

  // ---- SEO checklist, live
  const target = d.targetSearch.trim().toLowerCase();
  const firstPara = plainText(d.blocks.find((b) => b.t === "p" && (b.text ?? "").trim())?.text ?? "").toLowerCase();
  const allText = d.blocks.map((b) => `${b.text ?? ""} ${(b.items ?? []).join(" ")}`).join(" ");
  const words = countWords(d.blocks);
  const links = [...allText.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const desc = d.description.trim().length;
  const checks: { ok: boolean | "half"; label: string }[] = [
    { ok: !target ? "half" : (d.seoTitle || d.title).toLowerCase().includes(target), label: target ? "Target search in the title" : "Set a target search (right)" },
    { ok: !target ? "half" : firstPara.includes(target), label: "Target search in the first paragraph" },
    { ok: desc >= 120 && desc <= 160 ? true : desc >= 70 ? "half" : false, label: `SEO description 120–160 characters (${desc})` },
    { ok: d.blocks.filter((b) => b.t === "h2").length >= 2, label: "At least 2 headings" },
    { ok: !!d.coverUrl && d.coverAlt.trim().length > 4, label: "Cover photo with a description (alt text)" },
    { ok: words >= 600 ? true : words >= 300 ? "half" : false, label: `About 600+ words (${words})` },
    { ok: links.some((l) => SERVICE_PATHS.some((s) => l.startsWith(s))), label: "Link to one of your service pages" },
    { ok: links.filter((l) => l.startsWith("/blog/")).length >= 2 ? true : links.some((l) => l.startsWith("/blog/")) ? "half" : false, label: "Link to 2 related posts" },
  ];
  const score = checks.filter((c) => c.ok === true).length;

  const seoTitle = d.seoTitle || d.title;
  const snippet = d.description || plainText(firstPara).slice(0, 155);
  const scheduled = status === "published" && publishedAt && new Date(publishedAt).getTime() > Date.now();

  const input = "w-full rounded-lg border px-3 min-h-10 bg-transparent";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link href="/seo/blog" className="text-2 text-[13px] hover:underline">← Blog</Link>
        <b className="text-[18px] flex-1 min-w-[200px] truncate">{d.title || "Untitled post"}</b>
        <span className="text-3 text-[12px]">
          {save === "saving" ? "Saving…" : save === "unsaved" ? "Unsaved changes" : save === "error" ? "Not saved" : "Saved"}
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${status === "published" ? (scheduled ? "bg-[#eaf0ff] text-[#2a4bb0]" : "bg-[#e8f5ee] text-[#1f7a4d]") : "bg-[var(--surface)] text-2"}`}>
          {status !== "published" ? "Draft" : scheduled ? `Scheduled ${new Date(publishedAt!).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : "Published"}
        </span>
        <button type="button" onClick={() => setPreview(true)} className="rounded-lg border px-3 min-h-9 font-semibold text-[13px] hover:surface-2">Preview</button>
        {status === "published" && !scheduled && (
          <a href={`https://www.ozirealty.com.au/blog/${d.slug}`} target="_blank" rel="noreferrer" className="rounded-lg border px-3 min-h-9 inline-flex items-center font-semibold text-[13px] hover:surface-2">View on site</a>
        )}
        <button type="button" onClick={() => setPublishOpen(true)} className="rounded-lg bg-[var(--accent)] text-white px-4 min-h-9 font-bold text-[13px]">
          {status === "published" ? "Publish settings" : "Publish"}
        </button>
      </div>
      {saveError && <p className="mb-3 rounded-lg bg-[#fde8e8] text-[#a12a2a] px-3 py-2 text-[13px]">{saveError}</p>}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <div className="rounded-2xl border p-4 surface-1 min-w-0">
          <label className="block text-[13px] font-semibold mb-1.5">Title</label>
          <input value={d.title} onChange={(e) => set("title", e.target.value)} className={`${input} text-[16px] font-semibold`} />

          <label className="block text-[13px] font-semibold mt-3 mb-1.5">Web address</label>
          <div className="flex items-center rounded-lg border min-h-10 px-3 text-[13.5px]">
            <span className="text-3">ozirealty.com.au/blog/</span>
            <input
              value={d.slug}
              disabled={locked}
              onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))}
              className="flex-1 bg-transparent outline-none disabled:text-2"
            />
          </div>
          <p className="text-3 text-[11.5px] mt-1">{locked ? "Fixed: this post has been published, and Google ranks this address." : "Can change until the first publish; fixed after that."}</p>

          <label className="block text-[13px] font-semibold mt-3 mb-1.5">Cover photo</label>
          <div className="flex flex-wrap gap-3 items-start">
            <div className="w-[200px] aspect-[16/9] rounded-lg surface-2 border overflow-hidden grid place-items-center text-3 text-[12px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {d.coverUrl ? <img src={d.coverUrl} alt="" className="w-full h-full object-cover" /> : "No photo"}
            </div>
            <div className="flex-1 min-w-[200px] space-y-2">
              <label className="inline-flex items-center gap-1.5 rounded-lg border px-3 min-h-9 font-semibold text-[13px] cursor-pointer hover:surface-2">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} Upload photo
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} />
              </label>
              {d.coverUrl && (
                <button type="button" onClick={() => set("coverUrl", "")} className="ml-2 text-[12.5px] text-2 hover:underline">Remove</button>
              )}
              <input value={d.coverAlt} onChange={(e) => set("coverAlt", e.target.value)} placeholder="Describe the photo, e.g. Aerial view of an Adelaide suburb" className={`${input} text-[13px]`} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-4 mb-2">
            <b className="text-[13px] mr-1">Body</b>
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value;
                e.target.value = "";
                if (!v) return;
                const s = SERVICES.find((x) => x.href === v);
                const p = posts.find((x) => `/blog/${x.slug}` === v);
                insertLink(v, s?.label ?? p?.title ?? v);
              }}
              className="rounded-md border px-2 min-h-8 text-[12.5px] bg-transparent"
              aria-label="Insert a link"
            >
              <option value="">🔗 Link to…</option>
              <optgroup label="Your service pages">
                {SERVICES.map((s) => (
                  <option key={s.href} value={s.href}>{s.label}</option>
                ))}
              </optgroup>
              <optgroup label="Other posts">
                {posts.slice(0, 80).map((p) => (
                  <option key={p.slug} value={`/blog/${p.slug}`}>{p.title.slice(0, 70)}</option>
                ))}
              </optgroup>
            </select>
            <span className="text-3 text-[11.5px]">Adds to the end of the block you are in. Bold: **words**</span>
          </div>

          <div className="space-y-2">
            {d.blocks.map((b, i) => (
              <div key={i} className={`group rounded-lg border ${focus === i ? "border-[var(--accent)]/60" : ""}`}>
                <div className="flex items-center gap-1 px-2 pt-1.5">
                  <select value={b.t} onChange={(e) => {
                    const t = e.target.value as BlogBlock["t"];
                    setBlock(i, t === "ul" ? { t, items: b.items ?? (b.text ? b.text.split("\n") : [""]), text: undefined } : { t, text: b.text ?? (b.items ?? []).join(" "), items: undefined });
                  }} className="rounded border px-1.5 min-h-7 text-[12px] bg-transparent">
                    <option value="p">Paragraph</option>
                    <option value="h2">Heading</option>
                    <option value="h3">Sub-heading</option>
                    <option value="ul">Bullet list</option>
                  </select>
                  <span className="flex-1" />
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => setD((x) => { const a = [...x.blocks]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...x, blocks: a }; })} className="p-1 text-3 hover:text-[var(--fg)] disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button type="button" aria-label="Move down" disabled={i === d.blocks.length - 1} onClick={() => setD((x) => { const a = [...x.blocks]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return { ...x, blocks: a }; })} className="p-1 text-3 hover:text-[var(--fg)] disabled:opacity-30"><ArrowDown size={14} /></button>
                  <button type="button" aria-label="Delete block" disabled={d.blocks.length === 1} onClick={() => setD((x) => ({ ...x, blocks: x.blocks.filter((_, j) => j !== i) }))} className="p-1 text-3 hover:text-[#b02f2f] disabled:opacity-30"><Trash2 size={14} /></button>
                </div>
                {b.t === "ul" ? (
                  <textarea
                    value={(b.items ?? []).join("\n")}
                    onFocus={() => setFocus(i)}
                    onChange={(e) => setBlock(i, { items: e.target.value.split("\n") })}
                    rows={Math.max(3, (b.items ?? []).length + 1)}
                    placeholder="One point per line"
                    className="w-full bg-transparent outline-none px-3 py-2 text-[14px] leading-relaxed resize-y"
                  />
                ) : (
                  <textarea
                    value={b.text ?? ""}
                    onFocus={() => setFocus(i)}
                    onChange={(e) => setBlock(i, { text: e.target.value })}
                    rows={b.t === "p" ? Math.max(3, Math.ceil((b.text ?? "").length / 90)) : 1}
                    placeholder={b.t === "p" ? "Write a paragraph…" : "Heading"}
                    className={`w-full bg-transparent outline-none px-3 py-2 leading-relaxed resize-y ${b.t === "h2" ? "text-[18px] font-bold" : b.t === "h3" ? "text-[15.5px] font-bold" : "text-[14px]"}`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(["p", "h2", "h3", "ul"] as const).map((t) => (
              <button key={t} type="button" onClick={() => { setD((x) => ({ ...x, blocks: [...x.blocks, t === "ul" ? { t, items: [""] } : { t, text: "" }] })); setFocus(d.blocks.length); }} className="rounded-md border px-2.5 min-h-8 text-[12.5px] font-semibold hover:surface-2">
                + {t === "p" ? "Paragraph" : t === "h2" ? "Heading" : t === "h3" ? "Sub-heading" : "Bullet list"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border p-4 surface-1">
            <div className="text-3 text-[11px] uppercase tracking-[0.08em] font-bold mb-2">How it looks in Google</div>
            <div className="rounded-lg border p-3 bg-white text-left" style={{ fontFamily: "Arial, sans-serif" }}>
              <div className="text-[12px] text-[#202124] truncate">ozirealty.com.au › blog › {d.slug}</div>
              <div className="text-[17px] text-[#1a0dab] leading-snug my-0.5">{(seoTitle + " | Ozi Realty").slice(0, 62)}{(seoTitle + " | Ozi Realty").length > 62 ? "…" : ""}</div>
              <div className="text-[12.5px] text-[#4d5156]">{snippet.slice(0, 158) || "Write an SEO description below."}{snippet.length > 158 ? "…" : ""}</div>
            </div>
            <label className="block text-[13px] font-semibold mt-3 mb-1.5">Google title <span className="text-3 font-normal">(optional, {d.seoTitle.length}/60)</span></label>
            <input value={d.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} placeholder="Defaults to the title" className={`${input} text-[13px]`} />
            <label className="block text-[13px] font-semibold mt-3 mb-1.5">SEO description <span className="text-3 font-normal">({desc} / 160)</span></label>
            <textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={3} className="w-full rounded-lg border px-3 py-2 bg-transparent text-[13px]" placeholder="One or two sentences that make someone want to click" />
            <label className="block text-[13px] font-semibold mt-3 mb-1.5">Target search</label>
            <input value={d.targetSearch} onChange={(e) => set("targetSearch", e.target.value)} placeholder="e.g. independent property valuation adelaide" className={`${input} text-[13px]`} />
          </div>
          <div className="rounded-2xl border p-4 surface-1">
            <div className="text-3 text-[11px] uppercase tracking-[0.08em] font-bold mb-2">SEO checklist · {score} of {checks.length}</div>
            {checks.map((c) => (
              <div key={c.label} className="flex gap-2 py-1 text-[13px]">
                <span className={c.ok === true ? "text-[#1f7a4d] font-bold" : c.ok === "half" ? "text-[#946200] font-bold" : "text-[#b02f2f] font-bold"}>{c.ok === true ? "✓" : c.ok === "half" ? "!" : "✗"}</span>
                {c.label}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {status === "published" ? (
              <button type="button" onClick={async () => { if (!confirm("Take this post off the website? It stays here as a draft.")) return; const r = await unpublishBlogPost({ id: post.id }); if (r.ok) { setStatus("draft"); router.refresh(); } }} className="text-[12.5px] text-2 hover:underline">Take off the website</button>
            ) : !post.firstPublishedAt ? (
              <button type="button" onClick={async () => { if (!confirm("Delete this draft?")) return; const r = await deleteBlogPost({ id: post.id }); if (r.ok) router.push("/seo/blog"); }} className="text-[12.5px] text-[#b02f2f] hover:underline">Delete draft</button>
            ) : null}
          </div>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 overflow-y-auto" onClick={() => setPreview(false)}>
          <article className="max-w-[760px] mx-auto rounded-2xl bg-white text-[#1f2937] p-6 sm:p-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex mb-4"><span className="text-[12px] text-[#5b6478]">Preview, as it will read on the website</span><button type="button" onClick={() => setPreview(false)} className="ml-auto" aria-label="Close"><X size={18} /></button></div>
            <h1 className="text-[30px] font-bold leading-tight text-[#13254a]">{d.title}</h1>
            {d.coverUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={d.coverUrl} alt={d.coverAlt} className="w-full rounded-xl my-5" />}
            <div className="space-y-4 text-[16px] leading-[1.75] [&_a]:text-[#d84315] [&_a]:underline">
              {d.blocks.map((b, i) =>
                b.t === "h2" ? <h2 key={i} className="text-[22px] font-bold text-[#13254a] pt-2">{b.text}</h2>
                : b.t === "h3" ? <h3 key={i} className="text-[18px] font-bold text-[#13254a]">{b.text}</h3>
                : b.t === "ul" ? <ul key={i} className="list-disc pl-6 space-y-1">{(b.items ?? []).filter(Boolean).map((it, j) => <li key={j}>{inlineText(it)}</li>)}</ul>
                : <p key={i}>{inlineText(b.text ?? "")}</p>,
              )}
            </div>
          </article>
        </div>
      )}

      {publishOpen && (
        <PublishDialog
          id={post.id}
          slug={d.slug}
          checks={checks}
          score={score}
          isLive={status === "published"}
          onClose={() => setPublishOpen(false)}
          onDone={(at) => {
            setStatus("published");
            setPublishedAt(at);
            setPublishOpen(false);
            router.refresh();
          }}
          saving={save !== "saved"}
        />
      )}
    </div>
  );
}

function PublishDialog(p: {
  id: string;
  slug: string;
  checks: { ok: boolean | "half"; label: string }[];
  score: number;
  isLive: boolean;
  saving: boolean;
  onClose: () => void;
  onDone: (at: string) => void;
}) {
  const [when, setWhen] = React.useState<"now" | "later">("now");
  const [at, setAt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ scheduled: boolean } | null>(null);
  const missing = p.checks.filter((c) => c.ok !== true);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const iso = when === "later" && at ? new Date(at).toISOString() : "";
      const r = await publishBlogPost({ id: p.id, at: iso });
      if (!r.ok) return setError(r.error);
      setDone({ scheduled: r.data.scheduled });
      p.onDone(iso || new Date().toISOString());
    } catch {
      setError("That didn't reach the CRM. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const url = `https://www.ozirealty.com.au/blog/${p.slug}`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={p.onClose}>
      <div className="w-full max-w-[600px] rounded-2xl bg-[var(--bg)] shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Publish">
        {done ? (
          <div className="p-7 text-center">
            <div className="text-[40px]">{done.scheduled ? "🗓️" : "🎉"}</div>
            <b className="text-[19px]">{done.scheduled ? "Scheduled" : "Your post is live"}</b>
            <p className="text-2 text-[13px] my-2 break-all">{url}</p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {!done.scheduled && <a href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-[var(--accent)] text-white px-4 min-h-10 inline-flex items-center font-bold">View on the website</a>}
              <button type="button" onClick={() => navigator.clipboard?.writeText(url)} className="rounded-lg border px-4 min-h-10 font-semibold hover:surface-2">Copy link</button>
              <Link href="/seo/blog" className="rounded-lg border px-4 min-h-10 inline-flex items-center font-semibold hover:surface-2">Back to Blog</Link>
            </div>
            <p className="mt-4 rounded-lg bg-[#e8f5ee] text-[#1f5a3a] text-[12.5px] px-3 py-2 text-left">It is in the sitemap now. Its Google numbers appear in Blog once Google has indexed it, usually within 1–2 weeks.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center px-5 py-4 border-b"><b className="text-[16px]">{p.isLive ? "Publish settings" : "Publish this post?"}</b><button type="button" onClick={p.onClose} className="ml-auto text-3" aria-label="Close"><X size={18} /></button></div>
            <div className="p-5 text-[13.5px]">
              <div className="grid grid-cols-[130px_1fr] gap-y-2.5 gap-x-3">
                <span className="text-2">Web address</span>
                <span><b className="break-all">ozirealty.com.au/blog/{p.slug}</b><br /><span className="text-3 text-[12px]">Fixed after publishing</span></span>
                <span className="text-2">SEO checklist</span>
                <span>
                  <b className={p.score >= 6 ? "text-[#1f7a4d]" : "text-[#946200]"}>{p.score} of {p.checks.length}</b>
                  {missing.length > 0 && <span className="text-2"> · still to do: {missing.map((m) => m.label.replace(/ \(.*\)$/, "").toLowerCase()).join("; ")}</span>}
                </span>
                <span className="text-2">When</span>
                <span className="space-y-1.5">
                  <label className="flex items-center gap-2"><input type="radio" checked={when === "now"} onChange={() => setWhen("now")} className="accent-[var(--accent)]" /> Now</label>
                  <label className="flex items-center gap-2 flex-wrap"><input type="radio" checked={when === "later"} onChange={() => setWhen("later")} className="accent-[var(--accent)]" /> On a date
                    {when === "later" && <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="rounded border px-2 min-h-8 bg-transparent" />}
                  </label>
                </span>
              </div>
              {p.saving && <p className="mt-3 text-[12.5px] text-[#946200]">Saving your latest changes first…</p>}
              {error && <p className="mt-3 text-[13px] text-[#b02f2f]">{error}</p>}
              <div className="flex justify-end gap-2 mt-5">
                <button type="button" onClick={p.onClose} className="rounded-lg border px-4 min-h-10 font-semibold hover:surface-2">Back to editing</button>
                <button type="button" disabled={busy || p.saving || (when === "later" && !at)} onClick={go} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white px-4 min-h-10 font-bold disabled:opacity-40">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {when === "now" ? "Publish now" : "Schedule"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
