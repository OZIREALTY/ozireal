import { BOOK_TITLE, bookFileUrl, bookReadUrl } from "@/server/book/book";

/**
 * The free-book welcome email (owner-approved preview, 2026-11-24). A fixed template,
 * not AI-drafted, sent the moment someone asks for the book on the website, so it does
 * not wait in the approval queue (§3.1 covers AI drafts; this is the same class as the
 * enquiry receipt). The owner approved the instant send on 2026-11-24. It carries a
 * working unsubscribe and the agency details (§10).
 *
 * The 17 MB PDF is NOT attached: that size is refused or bounced by many inboxes and
 * marks the sender as spammy. The book opens in the browser from a personal link, with
 * a download link for anyone who wants the file.
 */
const SITE = "https://www.ozirealty.com.au";
const NAVY = "#13254A";
const ORANGE = "#D84315";
const MUTED = "#5B6478";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CHAPTERS = [
  "It's your next chapter",
  "The “dream home” illusion",
  "Match your flow",
  "Don't let FOMO decide",
  "Read a home's daily flow",
  "What your family really needs",
  "The perfect-suburb myth",
  "When smaller feels right",
  "Excitement vs certainty",
  "A house is a mirror",
  "The Golden Key: budget meets real life",
];

const NEXT = [
  { href: `${SITE}/free-suburb-insight-report`, t: "Free suburb insight report", d: "Prices, rents and trends for the suburb you're eyeing", c: "Get mine" },
  { href: `${SITE}/buyer-agent-adelaide`, t: "A buyer's agent on your side", d: "We search, assess and negotiate for you, not the seller", c: "How it works" },
  { href: `${SITE}/new-homes-adelaide`, t: "New homes & projects", d: "House-and-land and townhouses across Adelaide", c: "Browse" },
  { href: `${SITE}/all-listings`, t: "Homes for sale now", d: "Our current listings, with every photo and detail", c: "See listings" },
];

export function bookEmailSubject() {
  return `Your free copy: ${BOOK_TITLE}`;
}

export function bookEmailText(o: { firstName: string; token: string; unsubscribeUrl: string }) {
  return [
    `Hi ${o.firstName},`,
    "",
    `Thank you for asking for the book. Here is your copy of ${BOOK_TITLE}.`,
    "",
    `Read it now in your browser (no download needed): ${bookReadUrl(o.token)}`,
    `Or download the PDF: ${bookFileUrl(o.token, true)}`,
    "",
    "I wrote it because most advice about buying focuses on price, suburbs and square metres, and I kept meeting people who bought the “right” house on paper and the wrong one for their life.",
    "",
    "It's a short read. Start with Chapter 1, and if one of the truths hits home, just reply and tell me which. I read every reply myself.",
    "",
    "When you're ready for the next step:",
    ...NEXT.map((n) => `- ${n.t}: ${n.href}`),
    "",
    "Free 15-minute chat: reply CHAT with a good time, or call 1800 400 333.",
    "",
    "Warm regards,",
    "Esi Dor",
    "Director & CEO, Ozi Realty · 308 Prospect Rd, Prospect SA 5082 · RLA 350628",
    "",
    `You're receiving this because you asked for the free book on ozirealty.com.au. Unsubscribe: ${o.unsubscribeUrl}`,
  ].join("\n");
}

export function bookEmailHtml(o: { firstName: string; token: string; unsubscribeUrl: string; signatureHtml: string }) {
  const read = bookReadUrl(o.token);
  const half = Math.ceil(CHAPTERS.length / 2);
  const col = (from: number, to: number) =>
    CHAPTERS.slice(from, to)
      .map((c, i) => `<b style="color:${ORANGE}">${from + i + 1}</b>&nbsp; ${esc(c)}`)
      .join("<br>");
  const card = (n: (typeof NEXT)[number]) =>
    `<td width="50%" valign="top" style="padding:5px"><a href="${n.href}" style="text-decoration:none;display:block;border:1.5px solid #E3E7EF;border-radius:12px;padding:14px 16px"><div style="font-size:15px;font-weight:bold;color:${NAVY}">${esc(n.t)}</div><div style="font-size:13px;color:${MUTED};margin-top:4px;line-height:1.4">${esc(n.d)}</div><div style="font-size:13px;color:${ORANGE};font-weight:bold;margin-top:8px">${esc(n.c)} &rarr;</div></a></td>`;

  return `<!doctype html><html><body style="margin:0;background:#EEF1F6">
<table cellpadding="0" cellspacing="0" width="100%" style="background:#EEF1F6"><tr><td align="center" style="padding:24px 10px">
<table cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:${NAVY};padding:30px 28px 0" align="center">
<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#FFB59E;font-weight:bold">Your free book</div>
<div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;color:#ffffff;margin:10px 0 6px">Welcome, ${esc(o.firstName)}.<br><span style="color:#FF7A45;font-style:italic">Your copy is here.</span></div>
<div style="font-size:15px;color:#C9D2E3;line-height:1.5;margin-bottom:22px">${esc(BOOK_TITLE)}, by Esi Dor</div>
<a href="${read}" style="text-decoration:none"><img src="${SITE}/brand/book-cover.png" alt="Book cover: ${esc(BOOK_TITLE)}" width="300" style="display:block;width:300px;max-width:70%;height:auto;border:0;border-radius:6px 6px 0 0"></a>
</td></tr>
<tr><td align="center" style="padding:26px 28px 8px">
<a href="${read}" style="display:inline-block;background:${ORANGE};color:#ffffff;text-decoration:none;font-weight:bold;font-size:18px;padding:17px 34px;border-radius:12px;box-shadow:0 4px 0 #A8320F">Read it now, in your browser &nbsp;&rarr;</a>
<div style="font-size:13px;color:${MUTED};margin-top:12px">Opens straight away on your phone or computer. No download needed.<br>Prefer a file? <a href="${bookFileUrl(o.token, true)}" style="color:${ORANGE};font-weight:bold">Download the PDF</a>.</div>
</td></tr>
<tr><td style="padding:18px 32px 4px;font-size:15.5px;line-height:1.7;color:#1F2937">
<p style="margin:0 0 14px">Hi ${esc(o.firstName)},</p>
<p style="margin:0 0 14px">Thank you for asking for the book. I wrote it because most advice about buying focuses on price, suburbs and square metres, and I kept meeting people who bought the &ldquo;right&rdquo; house on paper and the wrong one for their life.</p>
<p style="margin:0 0 14px">It&#39;s a short read. Start with <b style="color:${NAVY}">Chapter 1</b>, and if one of the truths hits home, just reply and tell me which. I read every reply myself.</p>
</td></tr>
<tr><td style="padding:10px 28px">
<table cellpadding="0" cellspacing="0" width="100%" style="background:#FFF4EF;border-left:4px solid ${ORANGE};border-radius:0 12px 12px 0"><tr><td style="padding:18px 20px">
<div style="font-family:Georgia,serif;font-size:18px;font-style:italic;color:${NAVY};line-height:1.45">&ldquo;This isn&#39;t just a house. It gave me back to myself.&rdquo;</div>
<div style="font-size:13px;color:${MUTED};margin-top:8px">Michael, from a true story in Chapter 1</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 28px 6px">
<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};font-weight:bold;margin:0 4px 10px">Inside the book</div>
<table cellpadding="0" cellspacing="0" width="100%"><tr>
<td width="50%" valign="top" style="padding:4px"><table cellpadding="0" cellspacing="0" width="100%" style="background:#F6F8FC;border-radius:10px"><tr><td style="padding:12px 14px;font-size:14px;line-height:1.75;color:${NAVY}">${col(0, half)}</td></tr></table></td>
<td width="50%" valign="top" style="padding:4px"><table cellpadding="0" cellspacing="0" width="100%" style="background:#F6F8FC;border-radius:10px"><tr><td style="padding:12px 14px;font-size:14px;line-height:1.75;color:${NAVY}">${col(half, CHAPTERS.length)}</td></tr></table></td>
</tr></table>
</td></tr>
<tr><td style="padding:22px 28px 6px">
<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};font-weight:bold;margin:0 4px 10px">When you&#39;re ready for the next step</div>
<table cellpadding="0" cellspacing="0" width="100%"><tr>${card(NEXT[0])}${card(NEXT[1])}</tr><tr>${card(NEXT[2])}${card(NEXT[3])}</tr></table>
</td></tr>
<tr><td style="padding:18px 28px 8px">
<table cellpadding="0" cellspacing="0" width="100%" style="border:2px solid ${NAVY};border-radius:12px"><tr><td style="padding:16px 18px">
<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${ORANGE};font-weight:bold">Free 15-minute chat</div>
<div style="font-size:18px;font-weight:bold;color:${NAVY};margin:4px 0 6px">Talk through your search with me</div>
<div style="font-size:14px;color:#374151;line-height:1.55">No pressure, no sales pitch. Just reply <b>CHAT</b> with a good time, or call <a href="tel:1800400333" style="color:${ORANGE};font-weight:bold;text-decoration:none">1800 400 333</a>.</div>
</td></tr></table>
</td></tr>
<tr><td style="background:#FFF4EF;padding:12px 28px;font-size:13px;color:${NAVY}"><strong>Need finance?</strong> Book a free chat with Smart Loanz, our associated broker. <a href="https://www.smartloanz.com.au/book-online" style="color:${ORANGE};font-weight:bold;text-decoration:none">Book now &rarr;</a></td></tr>
<tr><td style="padding:8px 28px 24px">
${o.signatureHtml}
<p style="margin:22px 0 0;font-size:12px;color:#6B7280;line-height:1.5">Ozi Realty · RLA 350628<br>You&#39;re receiving this because you asked for the free book on ozirealty.com.au. <a href="${esc(o.unsubscribeUrl)}" style="color:#6B7280">Unsubscribe</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
