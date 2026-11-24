"use client";

import * as React from "react";

/**
 * Renders the book's pages in the browser with PDF.js (cdnjs, pinned), one canvas per
 * page, drawn as they scroll into view. Works on phones, where a PDF link would
 * otherwise download instead of opening (owner, 2026-11-24).
 */
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

type PdfPage = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: unknown) => { promise: Promise<void> } };
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfJs = { GlobalWorkerOptions: { workerSrc: string }; getDocument: (o: unknown) => { promise: Promise<PdfDoc>; onProgress?: (p: { loaded: number; total: number }) => void } };

function loadPdfJs(): Promise<PdfJs> {
  const w = window as unknown as { pdfjsLib?: PdfJs };
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PDFJS;
    s.onload = () => (w.pdfjsLib ? resolve(w.pdfjsLib) : reject(new Error("PDF.js did not load")));
    s.onerror = () => reject(new Error("PDF.js did not load"));
    document.head.appendChild(s);
  });
}

export function BookReader({ src }: { src: string }) {
  const [doc, setDoc] = React.useState<PdfDoc | null>(null);
  const [pct, setPct] = React.useState(0);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let off = false;
    loadPdfJs()
      .then((lib) => {
        lib.GlobalWorkerOptions.workerSrc = WORKER;
        const task = lib.getDocument({ url: src });
        task.onProgress = (p) => p.total && setPct(Math.round((p.loaded / p.total) * 100));
        return task.promise;
      })
      .then((d) => !off && setDoc(d))
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [src]);

  if (failed)
    return (
      <p style={{ background: "#fff", borderRadius: 12, padding: 20 }}>
        The book could not be shown here. <a href={src} style={{ color: "#D84315", fontWeight: 700 }}>Open the PDF instead</a>.
      </p>
    );
  if (!doc)
    return (
      <div style={{ background: "#fff", borderRadius: 12, padding: "48px 20px", textAlign: "center", color: "#5B6478" }}>
        Opening your book{pct ? ` · ${pct}%` : "…"}
        <div style={{ height: 6, background: "#E3E7EF", borderRadius: 3, maxWidth: 320, margin: "14px auto 0", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "#D84315", transition: "width .2s" }} />
        </div>
      </div>
    );
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <Page key={i} doc={doc} n={i + 1} />
      ))}
    </div>
  );
}

function Page({ doc, n }: { doc: PdfDoc; n: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [done, setDone] = React.useState(false);
  React.useEffect(() => {
    const c = ref.current;
    if (!c || done) return;
    const io = new IntersectionObserver(
      async ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const page = await doc.getPage(n);
        const width = c.parentElement?.clientWidth ?? 800;
        const base = page.getViewport({ scale: 1 });
        const ratio = window.devicePixelRatio || 1;
        const vp = page.getViewport({ scale: (width / base.width) * ratio });
        c.width = vp.width;
        c.height = vp.height;
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        setDone(true);
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(c);
    return () => io.disconnect();
  }, [doc, n, done]);
  return (
    <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 6px 20px rgba(19,37,74,.10)", aspectRatio: "924 / 1308" }}>
      <canvas ref={ref} aria-label={`Page ${n}`} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
