"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { updateAgency, updateMyName } from "@/server/actions/agency";

/** Settings rows that turn into fields on Edit (Settings redesign, 2026-11-28). */
const btn = "rounded-[10px] border surface-2 px-3 min-h-8 text-[13px] font-bold hover:surface-3";
const inp = "w-full rounded-[9px] border surface-2 px-2.5 min-h-9 text-[16px] sm:text-[14px]";

type Fail = { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
const firstError = (r: Fail) => Object.values(r.fieldErrors ?? {}).flat().find(Boolean) ?? r.error;

export function AgencyRows({ v }: { v: { name: string; tradingName: string | null; licence: string | null; abn: string | null; jurisdiction: string; timezone: string } }) {
  const router = useRouter();
  const [edit, setEdit] = React.useState(false);
  const [f, setF] = React.useState({ name: v.name, tradingName: v.tradingName ?? "", licence: v.licence ?? "", abn: v.abn ?? "" });
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const rows: [keyof typeof f, string, string][] = [
    ["name", "Legal name", "e.g. Ozi Realty Pty Ltd"],
    ["tradingName", "Trading as", "Optional"],
    ["licence", "Licence (RLA)", "e.g. 123456"],
    ["abn", "ABN", "11 digits"],
  ];
  async function save() {
    setBusy(true);
    setErr(null);
    const r = await updateAgency(f).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r ? firstError(r as Fail) : "Could not reach the server.");
    setEdit(false);
    router.refresh();
  }
  return (
    <div>
      {rows.map(([k, label, ph]) => (
        <div key={k} className="flex items-center gap-3 py-2.5 border-t text-[14px]">
          <span className="w-[140px] sm:w-[190px] shrink-0 text-2">{label}</span>
          {edit ? (
            <input value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={inp} />
          ) : (
            <span className="flex-1 min-w-0 truncate">
              {(v as Record<string, string | null>)[k] || <span className="text-3">—</span>}
              {k === "abn" && !v.abn && <span className="ml-2 rounded-full bg-[#FFF1DC] text-[#8A4B00] px-2 py-0.5 text-[12px] font-bold">Missing</span>}
            </span>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3 py-2.5 border-t text-[14px]">
        <span className="w-[140px] sm:w-[190px] shrink-0 text-2">State &amp; time zone</span>
        <span className="flex-1">{v.jurisdiction} · {v.timezone.replace("Australia/", "")} time</span>
      </div>
      {err && <p className="text-[13px] text-[#b02f2f] mt-2">{err}</p>}
      <div className="flex gap-2 mt-3">
        {edit ? (
          <>
            <button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--accent)] text-white px-4 min-h-9 text-[13.5px] font-bold">
              {busy && <Loader2 size={14} className="animate-spin" />}Save
            </button>
            <button type="button" onClick={() => { setEdit(false); setErr(null); }} className={btn}>Cancel</button>
          </>
        ) : (
          <button type="button" onClick={() => setEdit(true)} className={btn}>Edit details</button>
        )}
      </div>
    </div>
  );
}

export function NameRow({ name, role, licence }: { name: string; role: string; licence: string | null }) {
  const router = useRouter();
  const [edit, setEdit] = React.useState(false);
  const [v, setV] = React.useState(name);
  const [err, setErr] = React.useState<string | null>(null);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "—";
  async function save() {
    setErr(null);
    const r = await updateMyName({ name: v }).catch(() => null);
    if (!r?.ok) return setErr(r ? firstError(r as Fail) : "Could not reach the server.");
    setEdit(false);
    router.refresh();
  }
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-11 w-11 rounded-full bg-[#13254A] text-white grid place-items-center font-extrabold shrink-0">{initials}</span>
      {edit ? (
        <div className="flex-1 flex flex-wrap gap-2">
          <input value={v} onChange={(e) => setV(e.target.value)} className={`${inp} max-w-[280px]`} aria-label="Your name" />
          <button type="button" onClick={save} className="rounded-[10px] bg-[var(--accent)] text-white px-3 min-h-9 text-[13px] font-bold">Save</button>
          <button type="button" onClick={() => setEdit(false)} className={btn}>Cancel</button>
          {err && <p className="w-full text-[13px] text-[#b02f2f]">{err}</p>}
        </div>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <b className="block text-[15px]">{name || "No name yet"}</b>
            <span className="text-2 text-[13px]">{role}{licence ? ` · RLA ${licence}` : ""}</span>
          </div>
          <button type="button" onClick={() => setEdit(true)} className={btn}>Edit name</button>
        </>
      )}
    </div>
  );
}
