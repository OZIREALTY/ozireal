/**
 * What fetched the tracking image (owner, 2026-11-23: opens must be trustworthy
 * enough for the insight report).
 *
 *   confirmed  a person opened it: their own mail app, or a webmail image proxy
 *              that fetches only when the message is opened (Gmail, Yahoo)
 *   automatic  Apple Mail Privacy Protection: Apple's proxy fetches every image on
 *              delivery, read or not, from a generic Mac user agent with no Safari
 *              version, so it says nothing about the reader
 *   scanner    security gateways and scripts that open everything; ignored
 *
 * Unknown agents count as confirmed only when they look like a real mail client
 * (an OS in the user agent). Being strict here is the point: a confirmed open that
 * is wrong is worse for the report than one that was missed.
 */
export type OpenSource = "confirmed" | "automatic" | "scanner";

const SCANNERS =
  /bot|crawl|spider|scan|preview|barracuda|mimecast|proofpoint|symantec|messagelabs|forcepoint|trendmicro|sophos|cisco|ironport|fortinet|zscaler|python|curl|wget|go-http|java\/|okhttp|axios|node-fetch|headless|phantom|slurp|facebookexternalhit|linkpreview|whatsapp|telegram/i;

/**
 * These fetch only when a person opens the message: Gmail's and Yahoo's image
 * proxies, and Outlook (desktop sends "Microsoft Office/..." and loads images on
 * open; the mobile app fetches through "Outlook-iOS-Android").
 */
const OPEN_PROXIES = /GoogleImageProxy|ggpht\.com|YahooMailProxy|Microsoft Office|Microsoft Outlook|Outlook-iOS-Android/i;

/**
 * Apple's MPP proxy: a Mac WebKit agent with no "Version/" and no "Safari/" token.
 * A person reading in Apple Mail on a Mac WITHOUT MPP sends the same agent, so
 * those land in automatic too; that undercounts rather than inflates.
 */
const APPLE_PROXY = /^Mozilla\/5\.0 \(Macintosh; Intel Mac OS X [\d_]+\) AppleWebKit\/[\d.]+ \(KHTML, like Gecko\)$/;

/** A real mail client names its operating system. */
const REAL_CLIENT = /iPhone|iPad|Android|Windows NT|Macintosh|CrOS|Linux/;

export function classifyOpen(userAgent: string | null | undefined): OpenSource {
  const ua = (userAgent ?? "").trim();
  if (!ua) return "scanner";
  if (OPEN_PROXIES.test(ua)) return "confirmed";
  if (SCANNERS.test(ua)) return "scanner";
  if (APPLE_PROXY.test(ua)) return "automatic";
  if (REAL_CLIENT.test(ua)) return "confirmed";
  return "scanner";
}
