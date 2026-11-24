import { eq, sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { listings, properties, suburbs } from "@/db/schema";
import { newHomesCard } from "./new-homes-card";
import type { EmailCard } from "@/db/schema";
import { kindSlug } from "@/lib/house-art-svg";
import { EMAIL_SIGNATURE_HTML } from "./notices";

/**
 * The matched-buyer email's HTML (redesigned 2026-11-18, owner-approved preview): the
 * personal paragraphs the agent approved, then a project card (picture, navy banner with
 * the price wording verbatim, a specs row, "why this one stands out" advantages, a strong
 * call to action, a private-viewing offer, the finance strip), the signature and the
 * unsubscribe line.
 *
 * The picture is the listing's real photo when it is on the website; otherwise the same
 * drawn home the New Homes page shows for that project (/house-art/<kind>-<n>.png).
 * Only public facts are used (§3.8). Inline styles and tables: mail clients ignore CSS.
 */

const SITE = "https://www.ozirealty.com.au";
const NAVY = "#13254A";
const ORANGE = "#D84315";
const MUTED = "#5B6478";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type EmailProperty = {
  kicker: string;
  title: string;
  address: string;
  suburb: string | null;
  priceDisplay: string | null;
  specs: { n: string; l: string }[];
  imageUrl: string;
  imageAlt: string;
  newHomes: boolean;
  url: string | null;
  link: { url: string; label: string };
};

/** Public facts for the card, or null when the listing is gone. */
export async function emailPropertyFor(tenantId: string, listingId: string): Promise<EmailProperty | null> {
  return withTenant(tenantId, async (tx) => {
    const [l] = await tx
      .select({
        id: listings.id,
        propertyId: listings.propertyId,
        slug: listings.slug,
        status: listings.status,
        section: listings.websiteSection,
        sourceUrl: listings.sourceUrl,
        type: listings.listingType,
        priceDisplay: listings.priceDisplay,
        priceMin: listings.searchPriceMin,
        projectName: listings.projectName,
        street: sql<string>`trim(coalesce(${properties.unit} || '/', '') || coalesce(${properties.streetNumber} || ' ', '') || coalesce(${properties.street}, ''))`,
        suburb: suburbs.name,
        propertyType: properties.propertyType,
        beds: properties.beds,
        baths: properties.baths,
        parking: properties.parking,
        land: properties.landAreaSqm,
        floor: properties.floorAreaSqm,
        photo: sql<string | null>`(select m.s3_key from listing_media m where m.listing_id = ${listings.id} and m.kind = 'photo' order by m.sort_order, m.created_at limit 1)`,
      })
      .from(listings)
      .innerJoin(properties, eq(properties.id, listings.propertyId))
      .leftJoin(suburbs, eq(suburbs.id, properties.suburbId))
      .where(eq(listings.id, listingId))
      .limit(1);
    if (!l) return null;

    const newHomes = l.section === "new_homes";
    // 0031: email-only stock is never on the site; its own photo is shown (media keys are
    // unguessable) and the button goes to where it is advertised, or asks for a reply.
    const emailOnly = l.section === "email_only";
    const onSite = !newHomes && !emailOnly && ["live", "under_offer"].includes(l.status);
    const ownPhoto = !!l.photo && (onSite || emailOnly);
    const nh = newHomes ? await newHomesCard(tx, { projectName: l.projectName, suburb: l.suburb, priceMin: l.priceMin, priceDisplay: l.priceDisplay }) : null;

    const url = onSite ? `${SITE}/property/${l.slug}` : null;
    const link = url
      ? { url, label: "See every photo & detail" }
      : emailOnly
        ? l.sourceUrl
          ? { url: l.sourceUrl, label: "View the listing" }
          : { url: `mailto:admin@ozirealty.com.au?subject=${encodeURIComponent(`About ${l.street}`)}`, label: "Reply to find out more" }
      : newHomes
        ? { url: `${SITE}/new-homes-adelaide`, label: "Explore the homes & inclusions" }
        : l.type === "rent"
          ? { url: `${SITE}/rent-property-house-adelaide`, label: "See our rentals" }
          : { url: `${SITE}/buyer-agent-adelaide`, label: "See how we help buyers" };

    // Specs: the New Homes card's ranges when there is one, else the property record.
    const s = nh?.specs ?? {};
    const pick = (a: string | undefined, b: number | null) => a ?? (b != null ? String(b) : null);
    const specs = [
      { n: pick(s.beds, l.beds), l: "Bedrooms" },
      { n: pick(s.baths, l.baths), l: "Bathrooms" },
      { n: pick(s.parking, l.parking), l: "Car" },
      { n: s.buildM2 ?? (l.floor ? String(l.floor) : null), l: "m² total" },
      { n: s.landM2 ?? (l.land ? String(l.land) : null), l: "m² land" },
    ]
      .filter((x): x is { n: string; l: string } => !!x.n)
      .slice(0, 4);

    const kind = nh?.kind ?? l.propertyType;
    const art = `${SITE}/house-art/${kindSlug(kind)}-${nh?.index ?? hashIndex(l.propertyId)}.png`;
    const where = nh?.heading ?? l.suburb ?? "";
    return {
      kicker: `${newHomes ? "New homes" : l.type === "rent" ? "For lease" : "For sale"}${where ? ` · ${where}` : ""}`,
      title: nh?.headingEm ?? (newHomes ? (l.projectName ?? l.street) : l.street),
      address: l.street,
      suburb: l.suburb,
      priceDisplay: l.priceDisplay,
      specs,
      imageUrl: ownPhoto ? `${SITE}/media/${l.photo}` : art,
      imageAlt: ownPhoto ? l.street : `Illustration: a new ${(kind ?? "home").toLowerCase()}${where ? ` in ${where}` : ""}`,
      newHomes,
      url,
      link,
    };
  });
}

function hashIndex(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 64;
}

const specCell = (n: string, l: string, last: boolean) =>
  `<td align="center" style="padding:12px 4px;${last ? "" : "border-right:1px solid #E3E7EF"}"><div style="font-size:20px;font-weight:bold;color:${NAVY}">${esc(n)}</div><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">${esc(l)}</div></td>`;
const advCell = (t: string, d: string) =>
  `<td width="50%" valign="top" style="padding:6px"><table cellpadding="0" cellspacing="0" width="100%" style="background:#F6F8FC;border-radius:10px"><tr><td valign="top" style="padding:12px 0 12px 12px;width:26px"><div style="width:22px;height:22px;border-radius:11px;background:${ORANGE};color:#ffffff;font-size:13px;line-height:22px;text-align:center;font-weight:bold">&#10003;</div></td><td style="padding:11px 12px 11px 8px;font-size:14px;color:${NAVY};line-height:1.35"><strong>${esc(t)}</strong>${d ? `<br><span style="font-size:12.5px;color:${MUTED}">${esc(d)}</span>` : ""}</td></tr></table></td>`;

export type MoreProperty = { property: EmailProperty; card: EmailCard | null };

/**
 * The first property and the rest (owner, 2026-11-24: one email may carry several).
 * The extra cards live in card.more, each with its listing; a listing that has gone
 * is dropped rather than failing the email.
 */
export async function emailPropertiesFor(
  tenantId: string,
  listingId: string | null,
  card: EmailCard | null | undefined,
): Promise<{ property: EmailProperty | null; more: MoreProperty[] }> {
  const property = listingId ? await emailPropertyFor(tenantId, listingId) : null;
  const more: MoreProperty[] = [];
  for (const m of card?.more ?? []) {
    const p = await emailPropertyFor(tenantId, m.listingId);
    if (p) more.push({ property: p, card: { title: m.title, urgency: m.urgency, advantages: m.advantages } });
  }
  return { property, more };
}

export function propertyEmailHtml(o: {
  body: string;
  property: EmailProperty | null;
  card?: EmailCard | null;
  more?: MoreProperty[];
  unsubscribeUrl: string;
  agencyLine: string;
}) {
  const p = o.property;
  const all = [...(p ? [{ property: p, card: o.card ?? null }] : []), ...(o.more ?? [])];
  const prices = all.map((x) => x.property.priceDisplay).filter((x): x is string => !!x);
  const paras = o.body
    .trim()
    .split(/\n{2,}/)
    .map((x) => `<p style="margin:0 0 14px">${emphasise(x, prices[0] ?? null).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const blocks = all.map((x, i) => propertyBlock(x.property, x.card, i === all.length - 1, all.length > 1)).join("");

  return `<!doctype html><html><body style="margin:0;background:#EEF1F6">
<table cellpadding="0" cellspacing="0" width="100%" style="background:#EEF1F6"><tr><td align="center" style="padding:24px 10px">
<table cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td style="padding:28px 28px 8px;font-size:15px;line-height:1.65;color:#1F2937">${paras}</td></tr>
${blocks}
<tr><td style="padding:8px 28px 24px;font-family:Arial,sans-serif">
${EMAIL_SIGNATURE_HTML}
<p style="margin:22px 0 0;font-size:12px;color:#6B7280;line-height:1.5">${esc(o.agencyLine)}<br>
You are receiving this because you asked us about property. <a href="${esc(o.unsubscribeUrl)}" style="color:#6B7280">Unsubscribe</a></p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

/** One property card. With several, the viewing offer and finance strip come once, under the last. */
function propertyBlock(p: EmailProperty, c: EmailCard | null, last: boolean, several: boolean) {
  const advantages = (c?.advantages ?? []).slice(0, 6);
  const advRows: string[] = [];
  for (let i = 0; i < advantages.length; i += 2) {
    const a = advantages[i];
    const b = advantages[i + 1];
    advRows.push(`<tr>${advCell(a.title, a.detail)}${b ? advCell(b.title, b.detail) : `<td width="50%"></td>`}</tr>`);
  }

  // No property: no block. The "Visit ozirealty.com.au" button used to be added to
  // every general message; the owner wants it only when asked for (2026-11-23).
  const viewing = last
    ? `<table cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;border:2px solid ${NAVY};border-radius:12px"><tr><td style="padding:16px 18px;text-align:left">
<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${ORANGE};font-weight:bold">Private viewing</div>
<div style="font-size:18px;font-weight:bold;color:${NAVY};margin:4px 0 6px;line-height:1.3">${several ? "Walk through any of these with me, one-on-one" : p.newHomes ? "Walk the display home with me, one-on-one" : "Walk through the home with me, one-on-one"}</div>
<div style="font-size:14px;color:#374151;line-height:1.55">I&#39;ll take you through the plans, the finishes and the numbers, at a time that suits you. No crowds, no pressure, just your questions answered.</div>
<div style="margin-top:12px;font-size:15px;color:${NAVY}">Just reply <span style="display:inline-block;background:${NAVY};color:#ffffff;font-weight:bold;padding:4px 12px;border-radius:6px;letter-spacing:.05em">YES</span> and I&#39;ll set it up.</div>
</td></tr></table>`
    : "";
  return `<tr><td style="padding:12px 20px 4px">
<table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #E3E7EF;border-radius:14px;overflow:hidden">
<tr><td style="line-height:0"><a href="${esc(p.link.url)}" data-ozi-track="listing"><img src="${esc(p.imageUrl)}" alt="${esc(p.imageAlt)}" width="558" style="display:block;width:100%;height:auto;border:0"></a></td></tr>
<tr><td style="background:${NAVY};padding:16px 20px">
<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#FFB59E;font-weight:bold">${esc(p.kicker)}</div>
<div style="font-size:22px;font-weight:bold;color:#ffffff;margin-top:4px;line-height:1.25">${esc(c?.title || p.title)}</div>
${p.priceDisplay ? `<div style="margin-top:10px"><span style="display:inline-block;background:${ORANGE};color:#ffffff;font-size:18px;font-weight:bold;padding:7px 14px;border-radius:8px">${esc(p.priceDisplay)}</span></div>` : ""}
</td></tr>
${p.specs.length ? `<tr><td><table cellpadding="0" cellspacing="0" width="100%" style="border-bottom:1px solid #E3E7EF"><tr>${p.specs.map((s, i) => specCell(s.n, s.l, i === p.specs.length - 1)).join("")}</tr></table></td></tr>` : ""}
${advRows.length ? `<tr><td style="padding:14px 14px 4px"><div style="padding:0 6px 4px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};font-weight:bold">Why this one stands out</div><table cellpadding="0" cellspacing="0" width="100%">${advRows.join("")}</table></td></tr>` : ""}
<tr><td align="center" style="padding:16px 20px 22px">
<div style="font-size:15px;font-weight:bold;color:${NAVY};margin-bottom:12px">${esc(c?.urgency || "See every detail before you decide.")}</div>
<a href="${esc(p.link.url)}" data-ozi-track="listing" style="display:inline-block;background:${ORANGE};color:#ffffff;text-decoration:none;font-weight:bold;font-size:17px;padding:16px 30px;border-radius:12px;box-shadow:0 4px 0 #A8320F">${esc(p.link.label)} &nbsp;&rarr;</a>
${viewing}
</td></tr>
${last && (p.newHomes || p.priceDisplay) ? `<tr><td style="background:#FFF4EF;padding:12px 20px;font-size:13px;color:${NAVY}"><strong>Need finance?</strong> Book a free chat with Smart Loanz, our associated broker. <a href="https://www.smartloanz.com.au/book-online" style="color:${ORANGE};font-weight:bold;text-decoration:none">Book now &rarr;</a></td></tr>` : ""}
</table>
</td></tr>`;
}

/**
 * The body's **marked phrases** in bold navy, and the price wording (verbatim) in an
 * orange highlight wherever it appears (2026-11-18). Everything else is escaped.
 */
export function emphasise(text: string, price: string | null) {
  let h = esc(text).replace(/\*\*([^*\n]{1,160})\*\*/g, `<strong style="color:${NAVY}">$1</strong>`);
  h = h.replace(/\*\*/g, "");
  if (price) {
    const ep = esc(price);
    h = h
      .split(ep)
      .join(`<span style="background:#FFE8DF;color:#B23A12;font-weight:bold;padding:1px 6px;border-radius:4px;white-space:nowrap">${ep}</span>`);
  }
  return h;
}

/** The plain-text twin, with the link, the private-viewing offer and the unsubscribe line. */
export function propertyEmailText(o: { body: string; property: EmailProperty | null; card?: EmailCard | null; more?: MoreProperty[]; unsubscribeUrl: string; agencyLine: string }) {
  const all = [...(o.property ? [{ property: o.property, card: o.card ?? null }] : []), ...(o.more ?? [])];
  const one = ({ property: p, card }: MoreProperty) => {
    const adv = (card?.advantages ?? []).map((a) => `- ${a.title}${a.detail ? `: ${a.detail}` : ""}`);
    return [
      `${p.kicker.toUpperCase()}`,
      card?.title || p.title,
      ...(p.priceDisplay ? [p.priceDisplay] : []),
      p.specs.map((s) => `${s.n} ${s.l.toLowerCase()}`).join(" · "),
      ...(adv.length ? ["", "Why this one stands out:", ...adv] : []),
      "",
      `${p.link.label}: ${p.link.url}`,
      "",
    ];
  };
  return [
    o.body.trim().replace(/\*\*/g, ""),
    "",
    ...(all.length
      ? [...all.flatMap(one), "Private viewing: just reply YES and I'll set it up.", ""]
      : ["www.ozirealty.com.au", ""]),
    "Esi Dor | Ozi Realty · 1800 400 333 · www.ozirealty.com.au",
    "—",
    o.agencyLine,
    `Unsubscribe: ${o.unsubscribeUrl}`,
  ].join("\n");
}
