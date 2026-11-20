import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Opens and clicks on sent emails (2026-11-20, owner-approved). Each email carries a
 * signed token naming the tenant and the sent item (an approval_items row), so the
 * public tracking routes can record the event without a login and nobody can forge one.
 * Served from the CRM host directly: CloudFront caches the public site and would swallow
 * repeat requests.
 */
const CRM = "https://crm.ozirealty.com.au";
const key = () => {
  const k = process.env.UNSUBSCRIBE_SECRET ?? env.AUTH_SECRET;
  if (!k) throw new Error("No secret to sign tracking links with (AUTH_SECRET).");
  return k;
};
const uuid = /^[0-9a-f-]{36}$/i;

export function trackToken(tenantId: string, itemId: string) {
  const p = `${tenantId}.${itemId}`;
  const sig = createHmac("sha256", key()).update(`track.${p}`).digest().subarray(0, 12);
  return `${Buffer.from(p).toString("base64url")}.${sig.toString("base64url")}`;
}

export function readTrackToken(token: string): { tenantId: string; itemId: string } | null {
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  const payload = Buffer.from(p, "base64url").toString("utf8");
  const want = createHmac("sha256", key()).update(`track.${payload}`).digest().subarray(0, 12);
  const got = Buffer.from(s, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const [tenantId, itemId] = payload.split(".");
  return uuid.test(tenantId ?? "") && uuid.test(itemId ?? "") ? { tenantId, itemId } : null;
}

/** Only our own site is a valid click destination: the route is never an open redirect. */
export function safeDestination(u: string | null): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && /(^|\.)ozirealty\.com\.au$/i.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Adds the tracking image and routes links to our own site through the click recorder.
 * Unsubscribe links are left alone: they must work exactly as written (Spam Act).
 */
export function addTracking(html: string, tenantId: string, itemId: string) {
  const t = trackToken(tenantId, itemId);
  const routed = html.replace(/href="(https:\/\/(?:www\.)?ozirealty\.com\.au[^"]*)"/gi, (all, href: string) => {
    const real = href.replace(/&amp;/g, "&");
    if (/unsubscribe/i.test(real)) return all;
    return `href="${CRM}/api/t/c/${t}?u=${encodeURIComponent(real)}"`;
  });
  const pixel = `<img src="${CRM}/api/t/o/${t}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`;
  return routed.includes("</body>") ? routed.replace("</body>", `${pixel}</body>`) : routed + pixel;
}

/**
 * The reply address on a sent email (option 2, owner-approved 2026-11-20):
 * reply+<item><sig>@in.ozirealty.com.au. Amazon SES receives it, the CRM counts the
 * reply against that exact email, and forwards it to the agency Gmail. Only switched on
 * (REPLY_INBOX=on) once the in.ozirealty.com.au mail record exists, so no reply bounces.
 */
export const REPLY_DOMAIN = process.env.REPLY_DOMAIN ?? "in.ozirealty.com.au";
export function replyInboxOn() {
  return process.env.REPLY_INBOX === "on";
}
export function replyAddress(itemId: string) {
  const id = itemId.replace(/-/g, "").toLowerCase();
  const sig = createHmac("sha256", key()).update(`reply.${id}`).digest("hex").slice(0, 10);
  return `reply+${id}${sig}@${REPLY_DOMAIN}`;
}
export function readReplyAddress(addr: string): string | null {
  const m = /^reply\+([0-9a-f]{32})([0-9a-f]{10})@/i.exec(addr.trim());
  if (!m) return null;
  const id = m[1].toLowerCase();
  const want = createHmac("sha256", key()).update(`reply.${id}`).digest("hex").slice(0, 10);
  if (want !== m[2].toLowerCase()) return null;
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
