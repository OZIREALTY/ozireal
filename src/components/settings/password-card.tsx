"use client";

import * as React from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { changePassword } from "@/server/actions/password";

/** Settings → Sign-in & password (owner-approved preview, 2026-11-28). */
function strength(p: string): { n: number; label: string; color: string } {
  let n = 0;
  if (p.length >= 12) n++;
  if (p.length >= 16) n++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) n++;
  if (/\d/.test(p)) n++;
  if (/[^A-Za-z0-9]/.test(p)) n++;
  if (p.length < 12) return { n: Math.min(n, 1), label: "Too short: at least 12 characters", color: "#b02f2f" };
  return n >= 4 ? { n, label: "Strong", color: "#2E7D32" } : n >= 3 ? { n, label: "Good", color: "#8A4B00" } : { n, label: "Weak: add length, numbers or symbols", color: "#b02f2f" };
}

function Field({ label, value, onChange, auto }: { label: string; value: string; onChange: (v: string) => void; auto: string }) {
  const [show, setShow] = React.useState(false);
  return (
    <label className="block mt-3">
      <span className="block text-[12.5px] font-semibold text-2 mb-1">{label}</span>
      <span className="relative block">
        <input
          type={show ? "text" : "password"}
          value={value}
          autoComplete={auto}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-[10px] border surface-2 px-3 pr-10 min-h-10 text-[16px] sm:text-[14px]"
        />
        <button type="button" aria-label={show ? "Hide" : "Show"} onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-3 p-1">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    </label>
  );
}

export function PasswordCard({ email, setAt, google, entra }: { email: string; setAt: string | null; google: boolean; entra: boolean }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [changedAt, setChangedAt] = React.useState(setAt);
  const has = !!changedAt;
  const s = strength(next);
  const ready = next.length >= 12 && next === again && (!has || current.length > 0);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await changePassword({ current, next, again }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      const fe = r && !r.ok && "fieldErrors" in r ? Object.values((r as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {})[0]?.[0] : null;
      return setMsg({ ok: false, text: fe ?? (r && !r.ok ? r.error : "Could not reach the server.") });
    }
    setChangedAt(r.data.changedAt);
    setCurrent("");
    setNext("");
    setAgain("");
    setMsg({ ok: true, text: r.data.wasSet ? "✓ Password changed. Other devices will need to sign in again." : "✓ Password set. You can now sign in with your email and this password." });
  }

  const row = "flex justify-between gap-3 py-2.5 border-b text-[14px]";
  const when = (d: string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div>
      <p className="text-2 text-[13px] mb-2">How you sign in to the CRM. Nobody, including the system, can see your password.</p>
      <div className={row}><span className="text-2">Login email</span><b className="truncate">{email}</b></div>
      <div className={row}>
        <span className="text-2">Password</span>
        {has ? <span className="font-semibold text-[#1B5E20] dark:text-[#9BE3A2]">✓ Set · changed {when(changedAt!)}</span> : <span className="text-2">Not set yet</span>}
      </div>
      {(google || entra) && (
        <div className={`${row} border-b-0`}>
          <span className="text-2">{google ? "Google" : "Microsoft"} sign-in</span>
          <span className="font-semibold text-[#1B5E20] dark:text-[#9BE3A2]">✓ Available</span>
        </div>
      )}

      {has && <Field label="Current password" value={current} onChange={setCurrent} auto="current-password" />}
      <Field label={has ? "New password" : "Choose a password"} value={next} onChange={setNext} auto="new-password" />
      {next && (
        <>
          <span className="block h-1.5 rounded-full surface-3 mt-1.5 overflow-hidden">
            <span className="block h-full rounded-full transition-all" style={{ width: `${Math.min(100, (s.n / 5) * 100)}%`, background: s.color }} />
          </span>
          <span className="block text-[12.5px] mt-1" style={{ color: s.color }}>{s.label}</span>
        </>
      )}
      <Field label={has ? "New password again" : "Password again"} value={again} onChange={setAgain} auto="new-password" />
      {again && <span className={`block text-[12.5px] mt-1 ${again === next ? "text-[#2E7D32]" : "text-[#b02f2f]"}`}>{again === next ? "✓ Matches" : "Does not match yet"}</span>}

      <button type="button" disabled={!ready || busy} onClick={save} className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--accent)] text-white px-4 min-h-10 text-[14px] font-bold disabled:opacity-50">
        {busy && <Loader2 size={15} className="animate-spin" />}
        {has ? "Save new password" : "Set password"}
      </button>
      {msg && (
        <p className={`mt-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold ${msg.ok ? "bg-[#E8F5E9] text-[#1B5E20] dark:bg-[#183A1C] dark:text-[#9BE3A2]" : "bg-[#FDE7E2] text-[#A12A12]"}`}>{msg.text}</p>
      )}
    </div>
  );
}
