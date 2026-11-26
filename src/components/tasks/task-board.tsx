"use client";

import * as React from "react";
import Link from "next/link";
import { arrangeTasks } from "@/server/actions/ops";
import type { TaskRow } from "./task-manager";

/**
 * Tasks board with real drag (owner-approved motion preview, 2026-11-26). Pointer
 * events, so mouse, pen and touch all work (touch: press and hold, then drag). The
 * card lifts, the others slide apart (FLIP) to show where it lands, another column
 * lights up, and on drop the whole column is saved: priority plus hand order.
 */
type Col = 1 | 2 | 3;
type Cols = Record<Col, string[]>;
type Drag = { id: string; from: Col; w: number; h: number; ox: number; oy: number; x: number; y: number };

const META: Record<Col, { l: string; badge: string; edge: string }> = {
  1: { l: "High", badge: "bg-[#FDE7E2] text-[#A12A12]", edge: "#D84315" },
  2: { l: "Normal", badge: "bg-[#FFF1DC] text-[#8A4B00]", edge: "#E0A33B" },
  3: { l: "Low", badge: "bg-[#C9D0DD] text-[#25314A]", edge: "#8592A8" },
};
const HOLD_MS = 450;

const order = (a: TaskRow, b: TaskRow) =>
  (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) ||
  (a.dueAt ? new Date(a.dueAt).getTime() : 9e15) - (b.dueAt ? new Date(b.dueAt).getTime() : 9e15);

function columnsOf(tasks: TaskRow[]): Cols {
  const by = (p: number) => tasks.filter((t) => t.priority === p).sort(order).map((t) => t.id);
  return { 1: by(1), 2: by(2), 3: by(3) };
}

export function TaskBoard({
  tasks,
  info,
  menu,
  controls,
  onSaved,
  onError,
}: {
  tasks: TaskRow[];
  info: (t: TaskRow) => { text: string; red: boolean; links: { href: string; label: string }[] };
  menu: (t: TaskRow) => React.ReactNode;
  controls: (t: TaskRow) => React.ReactNode;
  onSaved: (msg: string, undo: () => Promise<void>) => void;
  onError: (msg: string) => void;
}) {
  const byId = React.useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const [cols, setCols] = React.useState<Cols>(() => columnsOf(tasks));
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [over, setOver] = React.useState<Col | null>(null);
  const [glow, setGlow] = React.useState<string | null>(null);
  const dragRef = React.useRef<Drag | null>(null);
  const start = React.useRef<Cols | null>(null);
  const cards = React.useRef(new Map<string, HTMLElement>());
  const colEls = React.useRef(new Map<Col, HTMLElement>());
  const rects = React.useRef(new Map<string, DOMRect>());
  const hold = React.useRef<{ timer: number; x: number; y: number } | null>(null);

  // New data from the server, when nothing is being dragged.
  // Keyed on content, not on the array (the parent rebuilds it on every render).
  const sig = tasks.map((t) => `${t.id}:${t.priority}:${t.sortOrder ?? ""}`).join(",");
  React.useEffect(() => {
    if (!dragRef.current) setCols(columnsOf(tasks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // FLIP: every card that moved slides from its old place to its new one.
  React.useLayoutEffect(() => {
    const prev = rects.current;
    const next = new Map<string, DOMRect>();
    for (const [id, el] of cards.current) {
      const r = el.getBoundingClientRect();
      next.set(id, r);
      const a = prev.get(id);
      if (a && (a.top !== r.top || a.left !== r.left) && id !== dragRef.current?.id) {
        el.animate([{ transform: `translate(${a.left - r.left}px, ${a.top - r.top}px)` }, { transform: "none" }], {
          duration: 180,
          easing: "cubic-bezier(.2,.8,.2,1)",
        });
      }
    }
    rects.current = next;
  }, [cols]);

  function begin(id: string, from: Col, el: HTMLElement, x: number, y: number) {
    const r = el.getBoundingClientRect();
    const d = { id, from, w: r.width, h: r.height, ox: x - r.left, oy: y - r.top, x, y };
    dragRef.current = d;
    start.current = cols;
    setDrag(d);
    document.body.style.userSelect = "none";
  }

  function onPointerDown(e: React.PointerEvent, id: string, from: Col) {
    if (e.button !== 0) return;
    // Only the ⋮⋮ grip starts a drag (owner, 2026-11-26): clicks anywhere else on a
    // card, its pills and trays included, never pick it up.
    if (!(e.target as HTMLElement).closest("[data-grip]")) return;
    const el = e.currentTarget as HTMLElement;
    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      e.preventDefault();
      begin(id, from, el, e.clientX, e.clientY);
      return;
    }
    // Touch: press and hold, so a normal swipe still scrolls the page.
    const x = e.clientX;
    const y = e.clientY;
    hold.current = {
      x,
      y,
      timer: window.setTimeout(() => {
        hold.current = null;
        navigator.vibrate?.(15);
        begin(id, from, el, x, y);
      }, HOLD_MS),
    };
  }

  React.useEffect(() => {
    function move(e: PointerEvent) {
      if (hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8) {
        window.clearTimeout(hold.current.timer);
        hold.current = null;
      }
      const d = dragRef.current;
      if (!d) return;
      e.preventDefault();
      const nd = { ...d, x: e.clientX, y: e.clientY };
      dragRef.current = nd;
      setDrag(nd);
      // Which column is under the pointer, and where in it.
      let target: Col | null = null;
      for (const [c, el] of colEls.current) {
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 40 && e.clientY <= r.bottom + 40) target = c;
      }
      setOver(target);
      if (!target) return;
      setCols((cur) => {
        const others = cur[target!].filter((x) => x !== d.id);
        let idx = others.length;
        for (let i = 0; i < others.length; i++) {
          const r = cards.current.get(others[i])?.getBoundingClientRect();
          if (r && e.clientY < r.top + r.height / 2) {
            idx = i;
            break;
          }
        }
        const placed = [...others.slice(0, idx), d.id, ...others.slice(idx)];
        if (placed.join() === cur[target!].join()) return cur;
        const next: Cols = { 1: cur[1].filter((x) => x !== d.id), 2: cur[2].filter((x) => x !== d.id), 3: cur[3].filter((x) => x !== d.id) };
        next[target!] = [...others.slice(0, idx), d.id, ...others.slice(idx)];
        return next;
      });
    }
    async function up() {
      if (hold.current) {
        window.clearTimeout(hold.current.timer);
        hold.current = null;
      }
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      setDrag(null);
      setOver(null);
      document.body.style.userSelect = "";
      const before = start.current!;
      const now = await new Promise<Cols>((res) => setCols((c) => (res(c), c)));
      const to = ([1, 2, 3] as Col[]).find((c) => now[c].includes(d.id))!;
      const moved = to !== d.from || before[to].join() !== now[to].join();
      if (!moved) return;
      setGlow(d.id);
      window.setTimeout(() => setGlow(null), 700);
      const touched = Array.from(new Set<Col>([d.from, to]));
      const save = async (c: Cols) => {
        for (const col of touched) {
          const r = await arrangeTasks({ priority: col, ids: c[col] }).catch(() => null);
          if (!r?.ok) return false;
        }
        return true;
      };
      if (!(await save(now))) {
        setCols(before);
        onError("The new order was not saved. Try again.");
        return;
      }
      const name = byId.get(d.id)?.title ?? "Task";
      onSaved(to !== d.from ? `“${name.slice(0, 32)}${name.length > 32 ? "…" : ""}” is now ${META[to].l} priority` : "Order saved", async () => {
        setCols(before);
        await save(before);
      });
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [byId, onError, onSaved]);

  const dragged = drag ? byId.get(drag.id) : null;

  return (
    <div className="grid sm:grid-cols-3 gap-3">
      {([1, 2, 3] as Col[]).map((c) => (
        <div
          key={c}
          ref={(el) => {
            if (el) colEls.current.set(c, el);
          }}
          className={`rounded-2xl p-2.5 min-h-[160px] transition-[background,box-shadow] duration-200 ${
            over === c && drag && drag.from !== c ? "bg-[var(--accent)]/10 ring-2 ring-[var(--accent)]" : "surface-3"
          }`}
        >
          <h3 className="flex items-center gap-2 px-1 mb-2 text-[14px] font-bold">
            <span className={`rounded-full px-2 text-[12px] font-bold ${META[c].badge}`}>{META[c].l}</span>
            {cols[c].filter((id) => byId.has(id)).length}
          </h3>
          <div className="flex flex-col gap-2">
            {cols[c].map((id) => {
              const t = byId.get(id);
              if (!t) return null;
              const isDragged = drag?.id === id;
              const i = info(t);
              return (
                <div
                  key={id}
                  ref={(el) => {
                    if (el) cards.current.set(id, el);
                    else cards.current.delete(id);
                  }}
                  onPointerDown={(e) => onPointerDown(e, id, c)}
                  onContextMenu={(e) => drag && e.preventDefault()}
                  style={isDragged ? { height: drag!.h } : undefined}
                  className={
                    isDragged
                      ? "rounded-xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent)]/5"
                      : `group relative surface-2 border rounded-xl pl-8 pr-2.5 py-2 ${glow === id ? "animate-[task-glow_.7s_ease-out]" : ""}`
                  }
                >
                  {!isDragged && <CardBody t={t} edge={META[c].edge} info={i} menu={menu(t)} controls={controls(t)} />}
                </div>
              );
            })}
            {cols[c].length === 0 && <p className="text-3 text-[12.5px] px-1 py-4 text-center">Drag a task here</p>}
          </div>
        </div>
      ))}

      {drag && dragged && (
        <div
          className="fixed z-[70] pointer-events-none surface-2 border-2 border-[var(--accent)] rounded-xl pl-8 pr-2.5 py-2 shadow-2xl"
          style={{ left: drag.x - drag.ox, top: drag.y - drag.oy, width: drag.w, transform: "rotate(2deg) scale(1.03)" }}
        >
          <CardBody t={dragged} edge={META[(([1, 2, 3] as Col[]).find((c) => cols[c].includes(drag.id)) ?? drag.from)].edge} info={info(dragged)} menu={null} controls={null} />
        </div>
      )}
      <style>{`@keyframes task-glow{0%{box-shadow:0 0 0 0 rgba(216,67,21,.55)}100%{box-shadow:0 0 0 12px rgba(216,67,21,0)}}`}</style>
    </div>
  );
}

function CardBody({ t, edge, info, menu, controls }: { t: TaskRow; edge: string; info: { text: string; red: boolean; links: { href: string; label: string }[] }; menu: React.ReactNode; controls: React.ReactNode }) {
  return (
    <>
      <span aria-hidden className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r" style={{ background: edge }} />
      <span
        data-grip
        title="Drag to move"
        className="absolute left-0 top-0 bottom-0 w-7 grid place-items-center cursor-grab active:cursor-grabbing text-[13px] tracking-[-3px] text-3 hover:text-[var(--accent)] touch-none"
      >
        ⋮⋮
      </span>
      <div className="flex items-start gap-2">
        <b className="flex-1 min-w-0 text-[13.5px] leading-snug">{t.title}</b>
        {menu}
      </div>
      {controls && <div className="mt-1.5">{controls}</div>}
      {info.text && <span className={`block text-[12px] mt-1 ${info.red ? "text-[#A12A12] font-semibold" : "text-2"}`}>{info.text}</span>}
      {info.links.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {info.links.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11.5px] font-semibold text-2 hover:text-[var(--accent)] hover:border-[var(--accent)] truncate">
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
