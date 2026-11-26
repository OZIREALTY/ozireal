"use client";

import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A searchable picker with the same props as <Select> (owner-approved preview,
 * 2026-11-26): type part of a name, phone or email; arrows and Enter choose. Writes a
 * hidden input with the chosen value, so the surrounding form reads it unchanged.
 * The first option with an empty value is treated as "none".
 */
type Opt = { value: string; label: string; hint?: string | null };

const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

function Marked({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-[#FFE1D3] text-inherit rounded-[3px]">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function SearchSelect({
  label,
  name,
  options,
  defaultValue = "",
  errors,
  className,
  placeholder = "Search name, phone or email…",
  avatars = true,
}: {
  label: string;
  name: string;
  options: Opt[];
  defaultValue?: string;
  errors?: string[];
  className?: string;
  placeholder?: string;
  avatars?: boolean;
}) {
  const noneOpt = options.find((o) => o.value === "");
  const real = React.useMemo(() => options.filter((o) => o.value !== ""), [options]);
  const [value, setValue] = React.useState(defaultValue);
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hl, setHl] = React.useState(0);
  const box = React.useRef<HTMLDivElement>(null);
  const list = React.useRef<HTMLDivElement>(null);
  const chosen = real.find((o) => o.value === value);

  const k = squash(q);
  const hits = k ? real.filter((o) => squash(`${o.label}${o.hint ?? ""}`).includes(k)) : real;
  const shown = hits.slice(0, 200);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  React.useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${hl}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hl]);

  const pick = (v: string) => {
    setValue(v);
    setOpen(false);
    setQ("");
  };

  return (
    <div className={cn("relative", className)} ref={box}>
      <label className="block text-[12px] font-medium text-2 mb-1.5">{label}</label>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setQ("");
          setHl(0);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "w-full surface-2 border rounded-md px-2.5 py-2 text-[16px] sm:text-[13.5px] flex items-center gap-2 text-left min-h-[38px]",
          open && "ring-2 ring-[var(--accent)]/30 border-[var(--accent)]",
          errors?.length && "border-[#d03b3b]/60",
        )}
      >
        {chosen ? (
          <>
            {avatars && (
              <span className="grid place-items-center w-6 h-6 rounded-full bg-[#E3E8F3] text-[#3E4A63] text-[10.5px] font-bold shrink-0">{initials(chosen.label)}</span>
            )}
            <span className="truncate">{chosen.label}</span>
            <span
              role="button"
              aria-label="Clear"
              title="Clear"
              onClick={(e) => {
                e.stopPropagation();
                pick("");
              }}
              className="ml-auto grid place-items-center w-6 h-6 rounded-full text-3 hover:text-[#b02f2f] hover:surface-3"
            >
              <X size={14} />
            </span>
          </>
        ) : (
          <>
            <span className="text-3 truncate">{noneOpt?.label ?? "None"} · click to search</span>
            <ChevronDown size={15} className="ml-auto text-3 shrink-0" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[60] rounded-xl border surface-2 shadow-xl overflow-hidden">
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHl(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHl((h) => Math.min(shown.length - 1, h + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHl((h) => Math.max(0, h - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (shown[hl]) pick(shown[hl].value);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder={`🔍  ${placeholder}`}
            className="w-full bg-transparent border-b px-3 py-2.5 text-[16px] sm:text-[14px] outline-none"
          />
          <div ref={list} role="listbox" className="max-h-[240px] overflow-auto p-1">
            {!q && noneOpt && (
              <button type="button" onClick={() => pick("")} className="w-full text-left px-2.5 py-2 rounded-lg text-[13.5px] text-2 hover:surface-3">
                {noneOpt.label}
              </button>
            )}
            {shown.map((o, i) => (
              <button
                key={o.value}
                type="button"
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setHl(i)}
                onClick={() => pick(o.value)}
                className={cn("w-full text-left flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg", i === hl ? "bg-[var(--accent)]/10" : "")}
              >
                {avatars && (
                  <span className="grid place-items-center w-7 h-7 rounded-full bg-[#E3E8F3] text-[#3E4A63] text-[11px] font-bold shrink-0">{initials(o.label)}</span>
                )}
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold truncate">
                    <Marked text={o.label} q={q} />
                  </span>
                  {o.hint && (
                    <span className="block text-[12px] text-2 truncate">
                      <Marked text={o.hint} q={q} />
                    </span>
                  )}
                </span>
              </button>
            ))}
            {shown.length === 0 && <p className="px-3 py-3 text-[13px] text-2">Nothing matches “{q}”.</p>}
          </div>
          <p className="border-t px-3 py-1.5 text-[11.5px] text-3">
            {hits.length} of {real.length}
            {hits.length > shown.length ? ` (first ${shown.length} shown; keep typing)` : ""}
          </p>
        </div>
      )}
      {errors?.length ? <p className="text-[#d03b3b] text-[12px] mt-1">{errors[0]}</p> : null}
    </div>
  );
}
