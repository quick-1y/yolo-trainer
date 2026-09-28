const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

/**
 * Format an ISO-8601 timestamp as a relative time string ("2 days ago"),
 * localized to `locale`. Future timestamps (clock skew) clamp to "now".
 */
export function formatRelativeTime(iso: string, locale: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffSeconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffSeconds < 1) {
    return rtf.format(0, "second");
  }

  for (const [unit, secondsInUnit] of UNITS) {
    if (diffSeconds >= secondsInUnit || unit === "second") {
      const value = Math.floor(diffSeconds / secondsInUnit);
      return rtf.format(-value, unit);
    }
  }

  return rtf.format(0, "second");
}
