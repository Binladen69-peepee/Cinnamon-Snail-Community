import type { SeriesPoint } from "@/lib/admin/analytics";

/**
 * What the console's charts share in words: a day as people say it, and what
 * a series' shape says for anyone who cannot see it.
 */

export function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/** What the shape says, for anyone who cannot see it. */
export function describe(points: SeriesPoint[]): string {
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const peak = points.reduce((best, point) =>
    point.value > best.value ? point : best,
  );
  return `${total} in total over ${points.length} days, highest ${peak.value} on ${shortDate(peak.date)}.`;
}
