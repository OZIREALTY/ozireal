import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * The free book (owner, 2026-11-24): "10 Truths About Finding the Right Home".
 *
 * The PDF is the owner's copyright, so it is never in the repo (which is public) or the
 * public/ folder. It sits in the private media bucket and is served only to a signed
 * link, one per contact, sent in the welcome email. The link opens a reading page that
 * renders the pages in the browser, so nothing has to be downloaded.
 */
export const BOOK_KEY = "book/10-truths-about-finding-the-right-home.pdf";
export const BOOK_TITLE = "10 Truths About Finding the Right Home";
export const BOOK_FILENAME = "10-Truths-About-Finding-the-Right-Home-Esi-Dor.pdf";
const SITE = "https://www.ozirealty.com.au";

const key = () => {
  const k = process.env.UNSUBSCRIBE_SECRET ?? env.AUTH_SECRET;
  if (!k) throw new Error("No secret to sign book links with (AUTH_SECRET).");
  return k;
};
const uuid = /^[0-9a-f-]{36}$/i;

export function bookToken(tenantId: string, contactId: string) {
  const p = `${tenantId}.${contactId}`;
  const sig = createHmac("sha256", key()).update(`book.${p}`).digest().subarray(0, 12);
  return `${Buffer.from(p).toString("base64url")}.${sig.toString("base64url")}`;
}

export function readBookToken(token: string): { tenantId: string; contactId: string } | null {
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  const payload = Buffer.from(p, "base64url").toString("utf8");
  const want = createHmac("sha256", key()).update(`book.${payload}`).digest().subarray(0, 12);
  const got = Buffer.from(s, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const [tenantId, contactId] = payload.split(".");
  return uuid.test(tenantId ?? "") && uuid.test(contactId ?? "") ? { tenantId, contactId } : null;
}

export const bookReadUrl = (token: string) => `${SITE}/free-book/read/${token}`;
export const bookFileUrl = (token: string, download = false) =>
  `${SITE}/free-book/file/${token}${download ? "?download=1" : ""}`;

/**
 * The first time a person opens their book it goes on their record (one row ever,
 * keyed by contact), so the agent can see who actually read it. Never throws: a failed
 * log must not stop the book from opening.
 */
export async function logBookOpen(tenantId: string, contactId: string) {
  try {
    const { withTenant } = await import("@/db");
    const { interactions } = await import("@/db/schema");
    await withTenant(tenantId, (tx) =>
      tx
        .insert(interactions)
        .values({
          tenantId,
          contactId,
          channel: "web_form",
          direction: "in",
          occurredAt: new Date(),
          subject: `Opened the free book: ${BOOK_TITLE}`,
          body: "Opened their copy of the free book from the welcome email.",
          messageId: `book-open:${contactId}`,
        })
        .onConflictDoNothing(),
    );
  } catch {
    /* the book still opens */
  }
}
