"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { checkRepliesNow } from "@/server/actions/compose-email";

type Check = { at: string; found: number; looked: number; error: string | null };

/** When replies were last read from Gmail, and a button to read them now (2026-11-20). */
export function ReplyCheck({ last }: { last: Check | null }) {
  const router = useRouter();
  const [c, setC] = React.useState<Check | null>(last);
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = (await checkRepliesNow({})) as { ok: boolean; data?: Check; error?: string };
      if (r.ok && r.data) setC(r.data);
      else setC({ at: new Date().toISOString(), found: 0, looked: 0, error: r.error ?? "The check did not run." });
      router.refresh();
    } catch {
      setC({ at: new Date().toISOString(), found: 0, looked: 0, error: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  const when = c ? new Date(c.at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Adelaide" }) : null;
  return (
    <div className={`rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3 text-[14px] ${c?.error ? "bg-[#fde8e8] dark:bg-[#3a1c1c] text-[#a12a2a] dark:text-[#f3a3a3]" : "surface-2 border"}`}>
      <span className="flex-1 min-w-[220px]">
        {!c
          ? "Replies from your Gmail have not been checked yet."
          : c.error
            ? <><b>Replies are not being read.</b> {c.error}</>
            : <>Replies last checked at <b>{when}</b>{c.found ? `: ${c.found} new ${c.found === 1 ? "reply" : "replies"} found.` : ": nothing new."} Checked every 5 minutes.</>}
      </span>
      <button type="button" onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border-[1.5px] font-bold px-4 min-h-10 surface-2 text-[var(--text)] disabled:opacity-50">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        Check replies now
      </button>
    </div>
  );
}
