import { beforeAll, describe, expect, it } from "vitest";

/**
 * 0031: an email-only property's button can point at another site (its source link)
 * and still be tracked, without the click route becoming an open redirect.
 */
let t: typeof import("@/server/outbound/tracking");
const TENANT = "11111111-1111-1111-1111-111111111111";
const ITEM = "22222222-2222-2222-2222-222222222222";
const SRC = "https://www.realestate.com.au/property-house-sa-norwood-123";

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgres://u:p@127.0.0.1:5433/none";
  process.env.UNSUBSCRIBE_SECRET = "test-secret-for-link-signing";
  t = await import("@/server/outbound/tracking");
});

function wrapped(html: string) {
  const out = t.addTracking(html, TENANT, ITEM);
  const href = /href="([^"]+)"/.exec(out)?.[1]?.replace(/&amp;/g, "&") ?? "";
  const url = new URL(href);
  return { out, url, token: url.pathname.split("/").pop()!, u: url.searchParams.get("u"), s: url.searchParams.get("s") };
}

describe("tracked links", () => {
  it("routes a marked source link through the click recorder with a signature", () => {
    const w = wrapped(`<a href="${SRC}" data-ozi-track="listing">View</a>`);
    expect(w.url.origin).toBe("https://crm.ozirealty.com.au");
    expect(w.u).toBe(SRC);
    expect(w.s).toBeTruthy();
    expect(t.safeDestination(w.u, w.token, w.s)).toBe(SRC);
  });

  it("refuses an outside destination without, or with a wrong, signature", () => {
    const w = wrapped(`<a href="${SRC}" data-ozi-track="listing">View</a>`);
    expect(t.safeDestination(SRC, w.token, null)).toBeNull();
    expect(t.safeDestination("https://evil.example/phish", w.token, w.s)).toBeNull();
    expect(t.safeDestination(SRC, w.token, "AAAAAAAAAAAAAAAA")).toBeNull();
  });

  it("does not let one email's signature open a link for another email", () => {
    const w = wrapped(`<a href="${SRC}" data-ozi-track="listing">View</a>`);
    const other = t.trackToken(TENANT, "33333333-3333-3333-3333-333333333333");
    expect(t.safeDestination(SRC, other, w.s)).toBeNull();
  });

  it("leaves unmarked outside links (signature, social) and mailto alone", () => {
    const out = t.addTracking(
      `<a href="https://facebook.com/ozirealty">fb</a><a href="mailto:admin@ozirealty.com.au" data-ozi-track="listing">reply</a>`,
      TENANT,
      ITEM,
    );
    expect(out).toContain(`href="https://facebook.com/ozirealty"`);
    expect(out).toContain(`href="mailto:admin@ozirealty.com.au"`);
  });

  it("still tracks our own site and never touches unsubscribe", () => {
    const own = wrapped(`<a href="https://www.ozirealty.com.au/property/x" data-ozi-track="listing">See</a>`);
    expect(own.u).toBe("https://www.ozirealty.com.au/property/x");
    expect(own.s).toBeNull();
    expect(t.safeDestination(own.u)).toBe("https://www.ozirealty.com.au/property/x");
    const unsub = t.addTracking(`<a href="https://www.ozirealty.com.au/unsubscribe?x=1">Unsubscribe</a>`, TENANT, ITEM);
    expect(unsub).toContain(`href="https://www.ozirealty.com.au/unsubscribe?x=1"`);
  });
});
