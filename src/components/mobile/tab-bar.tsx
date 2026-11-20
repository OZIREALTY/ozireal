"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plus, Mic, Users, UserPlus, Building2, Send, Mail, Phone, Camera, X, Sparkles } from "lucide-react";
import { openAssistant } from "@/components/assistant/ask-button";

/**
 * The phone's bottom bar (2026-11-19): Today, Search, Add, Voice, Menu, in thumb reach,
 * with a word under every icon. Below the lg breakpoint only; the desktop keeps its
 * sidebar. Menu opens the existing navigation drawer; Search opens the command palette.
 */

export const SEARCH_EVENT = "ozi:search";

export function MobileTabBar() {
  const pathname = usePathname();
  const [adding, setAdding] = React.useState(false);
  const tab = "flex flex-col items-center justify-center gap-0.5 min-h-[60px] text-[12.5px] font-semibold";
  const on = (p: string) => pathname === p || pathname.startsWith(p + "/");

  return (
    <>
      <nav
        aria-label="Main"
        className="lg:hidden print:hidden fixed inset-x-0 bottom-0 z-[45] surface-2 border-t"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="max-w-[520px] mx-auto grid grid-cols-5 items-end px-2 py-1.5">
          <Link href="/dashboard" className={`${tab} ${on("/dashboard") ? "text-[var(--accent)]" : "text-2"}`}>
            <Home size={26} /> Today
          </Link>
          <Link href="/contacts" className={`${tab} ${on("/contacts") ? "text-[var(--accent)]" : "text-2"}`}>
            <Users size={26} /> Contacts
          </Link>
          <button type="button" className={`${tab} text-2`} onClick={() => setAdding(true)} aria-label="Add">
            <span className="h-[58px] w-[58px] -mt-6 rounded-full bg-[var(--accent)] text-white grid place-items-center shadow-[0_6px_16px_rgba(216,67,21,.35)]">
              <Plus size={30} strokeWidth={2.6} />
            </span>
            Add
          </button>
          <Link href="/properties" className={`${tab} ${on("/properties") || on("/listings") ? "text-[var(--accent)]" : "text-2"}`}>
            <Building2 size={26} /> Properties
          </Link>
          <Link href="/campaigns" className={`${tab} ${on("/campaigns") ? "text-[var(--accent)]" : "text-2"}`}>
            <Send size={26} /> Campaigns
          </Link>
        </div>
      </nav>

      {adding && <AddSheet onClose={() => setAdding(false)} />}
    </>
  );
}

function AddSheet({ onClose }: { onClose: () => void }) {
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const row =
    "w-full min-h-[58px] rounded-[14px] surface-3 border px-4 flex items-center gap-3 text-[17px] font-semibold text-left";
  const ask = (prefill: string) => {
    onClose();
    openAssistant({ prefill });
  };
  return (
    <div className="lg:hidden fixed inset-0 z-[70] bg-black/45 flex items-end" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add"
        className="w-full surface-2 rounded-t-[22px] px-4 pt-2.5"
        style={{ paddingBottom: "calc(18px + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto mb-2 h-1.5 w-11 rounded-full bg-[var(--line,#DCE2EC)] surface-3" />
        <div className="flex items-center mb-3">
          <h2 className="text-[21px] font-extrabold flex-1">Add</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2.5 -mr-2">
            <X size={24} />
          </button>
        </div>
        <div className="flex flex-col gap-2.5">
          <button type="button" className={row} onClick={() => ask("Add a new contact: ")}>
            <UserPlus size={22} /> New contact
          </button>
          <Link href="/voice" onClick={onClose} className={row}>
            <Mic size={22} /> Voice note
          </Link>
          <button type="button" className={row} onClick={() => ask("Log a call with ")}>
            <Phone size={22} /> Log a call
          </button>
          <Link href="/campaigns?new=1" onClick={onClose} className={row}>
            <Mail size={22} /> Send email
          </Link>
          <button type="button" className={row} onClick={() => ask("")}>
            <Sparkles size={22} /> Ask AI
          </button>
          <button
            type="button"
            className={`${row} border-[var(--accent)] text-[var(--accent)]`}
            onClick={() => {
              onClose();
              openAssistant({ prefill: "Here is a photo. Add what it shows." });
            }}
          >
            <Camera size={22} /> Snap a card, sign or brochure
          </button>
        </div>
        <p className="text-2 text-[14px] mt-3">The assistant fills it in from your words or a photo; you confirm before anything is saved.</p>
      </div>
    </div>
  );
}
