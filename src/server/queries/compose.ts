import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { query } from "@/db";
import { consents, contactIntent, contacts, listings, matches, properties, savedViews, suburbs } from "@/db/schema";
import { segmentAudience } from "@/server/segments/preview";
import { isEmptySegment, parseStoredFilter } from "@/server/segments/schema";

/**
 * Everything the email composer on /campaigns needs (2026-11-20): the listings an email
 * can be about, and every reachable person with what the "who gets it" groups filter on.
 * `canEmail` mirrors the send gate (an address, not do-not-contact, current email
 * consent granted) so the counts are honest; the gate itself still decides at draft and
 * again at send.
 */
export async function composeData() {
  return query(async (tx) => {
    const homes = await tx
      .select({
        listingId: listings.id,
        propertyId: properties.id,
        label: sql<string>`trim(both ' ' from coalesce(${listings.projectName}, coalesce(${properties.streetNumber} || ' ', '') || coalesce(${properties.street}, ''))) || coalesce(', ' || ${suburbs.name}, '')`,
        suburb: suburbs.name,
        priceDisplay: listings.priceDisplay,
        beds: properties.beds,
        status: listings.status,
        section: listings.websiteSection,
      })
      .from(listings)
      .innerJoin(properties, eq(properties.id, listings.propertyId))
      .leftJoin(suburbs, eq(suburbs.id, properties.suburbId))
      .where(sql`${listings.status} in ('live','under_offer','draft')`)
      .orderBy(sql`case ${listings.status} when 'live' then 0 when 'under_offer' then 1 else 2 end`, desc(listings.createdAt));

    const people = await tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.emailRaw,
        tags: contacts.tags,
        suburb: contacts.suburb,
        doNotContact: contacts.doNotContact,
        intent: contactIntent.intentType,
      })
      .from(contacts)
      .leftJoin(contactIntent, eq(contactIntent.contactId, contacts.id))
      .where(and(isNull(contacts.tombstonedAt), isNull(contacts.mergedIntoId)))
      .orderBy(contacts.firstName);

    const consentRows = await tx
      .select({ contactId: consents.contactId, status: consents.status })
      .from(consents)
      .where(eq(consents.channel, "email"))
      .orderBy(consents.occurredAt, consents.createdAt);
    const consent = new Map<string, string>();
    for (const c of consentRows) consent.set(c.contactId, c.status);

    const matchRows = await tx
      .select({ contactId: matches.contactId, propertyId: matches.propertyId, score: matches.score })
      .from(matches);
    const matched = new Map<string, Record<string, number>>();
    for (const m of matchRows) {
      const o = matched.get(m.contactId) ?? {};
      o[m.propertyId] = m.score;
      matched.set(m.contactId, o);
    }

    const tagCount = new Map<string, number>();
    const out = people.map((p) => {
      const tags = (p.tags ?? []).filter((t) => t && !/\.(csv|xlsx|vcf)$|^export_|^imported/i.test(t));
      for (const t of tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      const reachable = !!p.email && !p.doNotContact && consent.get(p.id) === "granted";
      const canEmail = reachable;
      return {
        id: p.id,
        name: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email || "Unnamed",
        firstName: p.firstName,
        tags,
        suburb: p.suburb,
        intent: p.intent,
        canEmail,
        why: canEmail ? null : !p.email ? "no email address" : p.doNotContact ? "do not contact" : "no email consent",
        matches: matched.get(p.id) ?? {},
      };
    });
    const tags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t, n]) => ({ tag: t, n }));
    /**
     * Saved audiences from the audience builder (owner, 2026-11-23): each one resolved
     * to its members now, so it can be ticked as a group in "Who gets it?". Who can
     * actually be emailed is still decided per person above and again at send.
     */
    const saved = await tx.select({ id: savedViews.id, name: savedViews.name, filter: savedViews.filter }).from(savedViews).orderBy(savedViews.name);
    const audiences: { id: string; name: string; members: string[] }[] = [];
    for (const s of saved) {
      const filter = parseStoredFilter(s.filter);
      if (isEmptySegment(filter)) continue;
      const members = await segmentAudience(tx, filter);
      audiences.push({ id: s.id, name: s.name, members: members.map((m) => m.id) });
    }
    return { homes, people: out, tags, audiences };
  });
}
export type ComposeData = Awaited<ReturnType<typeof composeData>>;
