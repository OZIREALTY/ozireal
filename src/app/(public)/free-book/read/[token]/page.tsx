import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BOOK_TITLE, bookFileUrl, logBookOpen, readBookToken } from "@/server/book/book";
import { BookReader } from "@/components/public/book-reader";

/**
 * Read the free book in the browser (owner, 2026-11-24): the welcome email's "Read it
 * now" button lands here. Each link is signed for one contact; the first open goes on
 * their record. Never indexed.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: `${BOOK_TITLE} | Ozi Realty`,
  robots: { index: false, follow: false },
};

export default async function ReadBookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = readBookToken(token);
  if (!t) notFound();
  await logBookOpen(t.tenantId, t.contactId);
  return (
    <main style={{ background: "#EEF1F6", minHeight: "100vh", padding: "28px 12px 60px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <p style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#D84315", fontWeight: 700, margin: 0 }}>Your free book</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(26px, 5vw, 38px)", color: "#13254A", margin: "6px 0 4px", lineHeight: 1.15 }}>{BOOK_TITLE}</h1>
        <p style={{ color: "#5B6478", margin: "0 0 18px" }}>
          By Esi Dor, Ozi Realty founder ·{" "}
          <a href={bookFileUrl(token, true)} style={{ color: "#D84315", fontWeight: 700 }}>Download the PDF</a>
        </p>
        <BookReader src={bookFileUrl(token)} />
      </div>
    </main>
  );
}
