"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { bulkBlogPosts } from "@/server/actions/blog";

/**
 * The Blog list with bulk actions (owner, 2026-11-25): tick posts, then publish, take off
 * the website, or delete drafts. The same rules as one at a time apply (delete only drafts
 * that were never published); anything skipped is listed.
 */
export type BlogRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  aiGenerated: boolean;
  clicks: number;
  impressions: number;
  position: number | null;
  prevClicks: number;
  needsAttention: string | null;
};

const n = (x: number) => x.toLocaleString("en-AU");

export function BlogTable({ rows, empty }: { rows: BlogRow[]; empty: string }) {
  const router = useRouter();
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const now = Date.now();
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const picked = rows.filter((r) => sel.has(r.id));
  const drafts = picked.filter((r) => r.status !== "published").length;
  const live = picked.length - drafts;

  async function run(op: "publish" | "unpublish" | "delete") {
    const label = op === "delete" ? `Delete ${drafts} draft${drafts === 1 ? "" : "s"}? This can't be undone.` : op === "unpublish" ? `Take ${live} post${live === 1 ? "" : "s"} off the website? They stay here as drafts.` : `Publish ${drafts} draft${drafts === 1 ? "" : "s"} now?`;
    if (!confirm(label)) return;
    setBusy(op);
    setMsg(null);
    try {
      const r = await bulkBlogPosts({ ids: [...sel], op });
      if (!r.ok) setMsg(r.error);
      else {
        setMsg(`${r.data.done} done.${r.data.skipped.length ? ` Skipped: ${r.data.skipped.join("; ")}` : ""}`);
        setSel(new Set());
        router.refresh();
      }
    } catch {
      setMsg("That didn't reach the CRM. Reload and try again.");
    } finally {
      setBusy(null);
    }
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg border px-3 min-h-9 text-[13px] font-semibold surface-2 hover:surface-3 disabled:opacity-40";
  return (
    <>
      {picked.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--accent)]/40 surface-2 shadow-sm px-3 py-2 mb-2">
          <b className="text-[13.5px] mr-1">{picked.length} selected</b>
          <button type="button" className={btn} disabled={!!busy || !drafts} onClick={() => run("publish")}>
            {busy === "publish" && <Loader2 size={14} className="animate-spin" />} Publish{drafts ? ` (${drafts})` : ""}
          </button>
          <button type="button" className={btn} disabled={!!busy || !live} onClick={() => run("unpublish")}>
            {busy === "unpublish" && <Loader2 size={14} className="animate-spin" />} Take off website{live ? ` (${live})` : ""}
          </button>
          <button type="button" className={`${btn} text-[#b02f2f]`} disabled={!!busy || !drafts} onClick={() => run("delete")}>
            {busy === "delete" && <Loader2 size={14} className="animate-spin" />} Delete drafts{drafts ? ` (${drafts})` : ""}
          </button>
          <button type="button" onClick={() => setSel(new Set())} className="ml-auto text-[13px] text-2 hover:underline">Clear</button>
        </div>
      )}
      {msg && <p className="mb-2 rounded-lg surface-2 border px-3 py-2 text-[13px]">{msg}</p>}

      <div className="rounded-2xl border surface-2 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-3 text-left text-[11px] uppercase tracking-[0.06em]">
                <th className="pl-4 pr-1 py-2.5 w-8">
                  <input type="checkbox" aria-label="Select all" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} className="w-4 h-4 accent-[var(--accent)]" />
                </th>
                <th className="font-medium px-2 py-2.5">Post</th>
                <th className="font-medium px-2 py-2.5">Status</th>
                <th className="font-medium px-2 py-2.5 text-right">Clicks</th>
                <th className="font-medium px-2 py-2.5 text-right">Shown</th>
                <th className="font-medium px-2 py-2.5 text-right">Position</th>
                <th className="font-medium px-4 py-2.5 text-right">vs last month</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const at = r.publishedAt ? new Date(r.publishedAt) : null;
                const scheduled = r.status === "published" && at && at.getTime() > now;
                const isLive = r.status === "published" && !scheduled;
                const d = r.clicks - r.prevClicks;
                const on = sel.has(r.id);
                return (
                  <tr key={r.id} className={`border-t ${on ? "bg-[var(--accent)]/[0.05]" : "hover:surface-3"}`}>
                    <td className="pl-4 pr-1 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.title}`}
                        checked={on}
                        onChange={() => setSel((s) => { const x = new Set(s); if (x.has(r.id)) x.delete(r.id); else x.add(r.id); return x; })}
                        className="w-4 h-4 accent-[var(--accent)]"
                      />
                    </td>
                    <td className="px-2 py-2.5 max-w-[460px]">
                      <Link href={`/seo/blog/${r.id}`} className="font-semibold hover:underline block truncate">{r.title}</Link>
                      <span className="text-3 text-[12px] block truncate">
                        {r.status !== "published"
                          ? `Draft${r.aiGenerated ? " · written with AI" : ""} · edited ${new Date(r.updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`
                          : (r.needsAttention ?? `/blog/${r.slug}`)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      {r.status !== "published" ? (
                        <span className="rounded-full surface-3 border px-2 py-0.5 text-[11.5px] font-semibold text-2">Draft</span>
                      ) : scheduled ? (
                        <span className="rounded-full bg-[#eaf0ff] text-[#2a4bb0] px-2 py-0.5 text-[11.5px] font-semibold">Scheduled {at!.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                      ) : r.needsAttention ? (
                        <span className="rounded-full bg-[#fff4db] text-[#946200] px-2 py-0.5 text-[11.5px] font-semibold">Needs attention</span>
                      ) : (
                        <span className="rounded-full bg-[#e8f5ee] text-[#1f7a4d] px-2 py-0.5 text-[11.5px] font-semibold">Published</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular">{isLive ? n(r.clicks) : "–"}</td>
                    <td className="px-2 py-2.5 text-right tabular">{isLive ? n(r.impressions) : "–"}</td>
                    <td className="px-2 py-2.5 text-right tabular">{isLive && r.position ? r.position.toFixed(1) : "–"}</td>
                    <td className={`px-4 py-2.5 text-right tabular ${d > 0 ? "text-[#1f7a4d]" : d < 0 ? "text-[#b02f2f]" : "text-3"}`}>
                      {!isLive ? "–" : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : "0"}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-2">{empty}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
