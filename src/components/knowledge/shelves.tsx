"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, GraduationCap, Scale, Upload, ClipboardPaste, Link2, Trash2, Loader2, Sparkles, FileText } from "lucide-react";
import { addKnowledge, removeKnowledge } from "@/server/actions/knowledge";
import { openAssistant } from "@/components/assistant/ask-button";

type From =
  | { type: "file"; name: string; kind: "pdf" | "docx" | "text"; base64: string }
  | { type: "paste"; text: string }
  | { type: "link"; url: string };

type Doc = {
  id: string;
  shelf: Shelf;
  title: string;
  source: "upload" | "paste" | "link" | "official";
  sourceRef: string | null;
  jurisdiction: string | null;
  instrument: string | null;
  versionDate: string | null;
  chunks: number;
  embedded: boolean;
  createdAt: Date;
};

type Shelf = "rules" | "office" | "legal";

const SHELVES = {
  rules: {
    label: "Instructions for the AI",
    icon: GraduationCap,
    blurb:
      "How every AI feature should work and write: your tone, words to use or avoid, how to sign off, what to always or never do. Applied to the assistant, email drafts, matching and content on every call.",
    example: "e.g. Always write in Australian English. Never use the word \"nestled\". Sign every email \"Esi\". Keep emails under 150 words.",
    ask: "Show me how you would write a short client email following my instructions.",
  },
  office: {
    label: "What the AI should know",
    icon: BookOpen,
    blurb:
      "Facts about your agency the AI should treat as true: services, fees, areas you cover, team, partners, your story, good example emails. Also applied on every call.",
    example: "e.g. We are part of Prospect Business Centre. We cover Adelaide's north and east. Our commission is…",
    ask: "What do you know about my agency from your training?",
  },
  legal: {
    label: "Legal library",
    icon: Scale,
    blurb:
      "Acts, regulations and official guidance. Not pasted into every call: the AI searches it when a question needs it and cites the Act and section, as research support to check with a licensee or solicitor.",
    example: "",
    ask: "Using the legal library, ",
  },
} as const;

const dateFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Adelaide" });

function kindOf(name: string): "pdf" | "docx" | "text" | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "txt" || ext === "md" || ext === "csv") return "text";
  return null;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function KnowledgeShelves({
  docs,
  jurisdiction,
  initialShelf,
}: {
  docs: Doc[];
  jurisdiction: string;
  initialShelf: Shelf;
}) {
  const router = useRouter();
  const [shelf, setShelf] = React.useState<Shelf>(initialShelf);
  const [mode, setMode] = React.useState<"file" | "paste" | "link">(initialShelf === "rules" ? "paste" : "file");
  const [title, setTitle] = React.useState("");
  const [text, setText] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [juris, setJuris] = React.useState(jurisdiction);
  const [instrument, setInstrument] = React.useState("");
  const [versionDate, setVersionDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ ok: boolean; msg: string } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const list = docs.filter((d) => d.shelf === shelf);
  const meta = SHELVES[shelf];
  const legal = shelf === "legal" ? { jurisdiction: juris, instrument, versionDate } : {};

  function reset() {
    setTitle("");
    setText("");
    setUrl("");
    setInstrument("");
    setVersionDate("");
  }

  async function send(from: From, label: string) {
    setBusy(true);
    setNote(null);
    const r = await addKnowledge({ shelf, title: title || undefined, from, ...legal }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setNote({ ok: false, msg: r && !r.ok ? r.error : `Could not reach the server while adding ${label}.` });
    setNote({ ok: true, msg: `Added "${r.data.title}" (${r.data.chunks} ${r.data.chunks === 1 ? "section" : "sections"}). Every AI feature uses it from now on.` });
    reset();
    router.refresh();
  }

  async function files(list: FileList | null) {
    for (const f of Array.from(list ?? [])) {
      const kind = kindOf(f.name);
      if (!kind) {
        setNote({ ok: false, msg: `${f.name}: use PDF, Word (.docx) or a text file.` });
        continue;
      }
      if (f.size > 5_000_000) {
        setNote({ ok: false, msg: `${f.name} is over 5 MB. Split it, or paste the part you need.` });
        continue;
      }
      await send({ type: "file", name: f.name, kind, base64: await toBase64(f) }, f.name);
    }
  }

  async function remove(d: Doc) {
    if (!window.confirm(`Remove "${d.title}" from the AI training? The AI stops using it straight away.`)) return;
    const r = await removeKnowledge({ id: d.id }).catch(() => null);
    if (!r?.ok) return setNote({ ok: false, msg: r && !r.ok ? r.error : "Could not reach the server." });
    router.refresh();
  }

  const field = "w-full rounded-md border surface-2 px-3 min-h-11 text-[15px] outline-none focus:border-[var(--accent)]";
  const tabBtn = (on: boolean) =>
    `inline-flex items-center gap-2 rounded-md px-3.5 min-h-11 text-[15px] font-semibold border ${
      on ? "bg-[var(--accent)] text-white border-transparent" : "surface-2 text-2 hover:text-[var(--text)]"
    }`;

  return (
    <div className="max-w-[1000px]">
      <div className="flex flex-wrap gap-2 mb-5">
        {(Object.keys(SHELVES) as Shelf[]).map((k) => {
          const S = SHELVES[k];
          const n = docs.filter((d) => d.shelf === k).length;
          return (
            <button key={k} type="button" className={tabBtn(shelf === k)} onClick={() => setShelf(k)}>
              <S.icon size={18} /> {S.label} <span className="opacity-75 tabular">{n}</span>
            </button>
          );
        })}
      </div>

      <section className="surface-2 border rounded-xl p-4 sm:p-5 mb-6">
        <p className="text-2 text-[14.5px] mb-4">{meta.blurb}</p>

        <div className="flex flex-wrap gap-2 mb-4">
          <button type="button" className={tabBtn(mode === "file")} onClick={() => setMode("file")}>
            <Upload size={17} /> Upload a file
          </button>
          <button type="button" className={tabBtn(mode === "paste")} onClick={() => setMode("paste")}>
            <ClipboardPaste size={17} /> Type or paste
          </button>
          <button type="button" className={tabBtn(mode === "link")} onClick={() => setMode("link")}>
            <Link2 size={17} /> From a web link
          </button>
        </div>

        <div className="grid gap-3">
          <input className={field} placeholder="Title (optional: the file or page name is used otherwise)" value={title} onChange={(e) => setTitle(e.target.value)} />

          {shelf === "legal" && (
            <div className="grid sm:grid-cols-3 gap-3">
              <input className={field} placeholder="Act or guidance, e.g. Land Agents Act 1994" value={instrument} onChange={(e) => setInstrument(e.target.value)} />
              <input className={field} placeholder="Jurisdiction, e.g. SA or CTH" value={juris} onChange={(e) => setJuris(e.target.value)} />
              <label className="flex items-center gap-2 text-2 text-[14px]">
                <span className="shrink-0">Version date</span>
                <input type="date" className={field} value={versionDate} onChange={(e) => setVersionDate(e.target.value)} />
              </label>
            </div>
          )}

          {mode === "file" && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void files(e.dataTransfer.files);
              }}
              className={`rounded-xl border-2 border-dashed p-6 text-center ${dragging ? "border-[var(--accent)] bg-[var(--accent)]/[0.06]" : ""}`}
            >
              <FileText size={28} className="mx-auto text-3" />
              <p className="text-[15px] font-semibold mt-2">Drop PDF or Word files here</p>
              <p className="text-2 text-[14px]">or</p>
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="mt-2 inline-flex items-center gap-2 rounded-md bg-[var(--accent)] text-white px-4 min-h-11 text-[15px] font-semibold disabled:opacity-60">
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />} Choose files
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                accept=".pdf,.docx,.txt,.md,.csv"
                onChange={(e) => {
                  void files(e.target.files);
                  e.target.value = "";
                }}
              />
              <p className="text-3 text-[13px] mt-2">PDF, Word (.docx) or text, up to 5 MB each. Scanned PDFs without text: paste the text instead.</p>
            </div>
          )}

          {mode === "paste" && (
            <>
              <textarea className={`${field} min-h-[180px] py-2.5`} placeholder={meta.example || "Paste the text here"} value={text} onChange={(e) => setText(e.target.value)} />
              <button type="button" disabled={busy || text.trim().length < 20} onClick={() => send({ type: "paste", text }, "the text")} className="justify-self-start inline-flex items-center gap-2 rounded-md bg-[var(--accent)] text-white px-4 min-h-11 text-[15px] font-semibold disabled:opacity-60">
                {busy && <Loader2 size={18} className="animate-spin" />} Add to {meta.label.toLowerCase()}
              </button>
            </>
          )}

          {mode === "link" && (
            <div className="flex flex-col sm:flex-row gap-3">
              <input className={field} placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
              <button type="button" disabled={busy || !url.trim()} onClick={() => send({ type: "link", url }, "the page")} className="shrink-0 inline-flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] text-white px-4 min-h-11 text-[15px] font-semibold disabled:opacity-60">
                {busy && <Loader2 size={18} className="animate-spin" />} Read and add
              </button>
            </div>
          )}

          {note && (
            <p role="status" className={`text-[14.5px] font-semibold ${note.ok ? "text-[#1B7A47] dark:text-[#6FDAA0]" : "text-[#A12A12] dark:text-[#FF8F78]"}`}>
              {note.msg}
            </p>
          )}
        </div>
      </section>

      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-[13px] font-bold tracking-[0.08em] uppercase text-2 flex-1">
          {meta.label} · {list.length} {list.length === 1 ? "document" : "documents"}
        </h2>
        {list.length > 0 && (
          <button type="button" onClick={() => openAssistant({ prefill: meta.ask })} className="inline-flex items-center gap-1.5 rounded-full border px-3 min-h-9 text-[14px] font-semibold surface-2 hover:text-[var(--accent)]">
            <Sparkles size={15} className="text-[var(--accent)]" /> Test the AI on this
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <p className="surface-2 border border-dashed rounded-xl p-8 text-center text-2 text-[15px]">
          Nothing here yet. Add the first one above; the AI uses it from its next reply.
        </p>
      ) : (
        <ul className="surface-2 border rounded-xl divide-y">
          {list.map((d) => (
            <li key={d.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-[15.5px] font-semibold leading-snug break-words">{d.title}</p>
                <p className="text-2 text-[13.5px] mt-0.5">
                  {[
                    d.shelf === "legal" && d.jurisdiction,
                    d.shelf === "legal" && d.instrument && d.instrument !== d.title && d.instrument,
                    d.versionDate && `version ${d.versionDate}`,
                    `${d.chunks} ${d.chunks === 1 ? "section" : "sections"}`,
                    `added ${dateFmt.format(new Date(d.createdAt))}`,
                    !d.embedded && "word search only so far",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {d.sourceRef && d.source === "link" && (
                  <a href={d.sourceRef} target="_blank" rel="noreferrer" className="text-[13.5px] text-[var(--accent)] underline underline-offset-2 break-all">
                    {d.sourceRef}
                  </a>
                )}
              </div>
              <button type="button" onClick={() => remove(d)} aria-label={`Remove ${d.title}`} className="h-10 w-10 grid place-items-center rounded-md text-2 hover:text-[#A12A12] hover:bg-[#FDE7E2] shrink-0">
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
