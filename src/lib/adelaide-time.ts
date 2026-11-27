/**
 * Adelaide wall-clock time <-> instants, without a date library. The server runs in UTC;
 * a date and time typed by the owner mean Adelaide time (ACST/ACDT, DST-aware).
 */
const TZ = "Australia/Adelaide";

function offsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") === 24 ? 0 : g("hour"), g("minute"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** "2026-11-23", "09:00" in Adelaide -> the instant. Null when malformed. */
export function adelaide(date: string, time = "00:00"): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const first = new Date(guess.getTime() - offsetMinutes(guess) * 60000);
  return new Date(guess.getTime() - offsetMinutes(first) * 60000);
}

/** Today's date in Adelaide as YYYY-MM-DD. */
export function adelaideToday(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(at);
}

export function adelaideLabel(at: Date): string {
  return at.toLocaleString("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
