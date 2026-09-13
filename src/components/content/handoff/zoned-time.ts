/** Timezone helpers for the handoff page (client-side, Intl only). */

export function safeTimeZone(tz: string | null | undefined): string | undefined {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

export function formatInZone(iso: string | Date, tz: string | undefined): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** Wall-clock parts of an instant in a timezone. */
function partsInZone(date: Date, tz: string | undefined) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** The instant when it's `hour`:00 tomorrow in the timezone (browser local when tz is unset). */
export function tomorrowAtInZone(hour: number, tz: string | undefined): Date {
  const now = partsInZone(new Date(), tz);
  // Noon UTC on today's zoned date, plus a day, avoids DST edge rollovers
  const tomorrow = new Date(Date.UTC(now.year, now.month - 1, now.day + 1, 12));
  const guess = Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), hour);
  // Shift by the zone's offset at that moment; a second pass settles DST changes
  let instant = guess;
  for (let i = 0; i < 2; i++) {
    const p = partsInZone(new Date(instant), tz);
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    instant -= wall - guess;
  }
  return new Date(instant);
}
