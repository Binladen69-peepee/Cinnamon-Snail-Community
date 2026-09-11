/**
 * Compact counts for the feed: 1240 becomes "1.2k".
 *
 * Feed chrome has to hold its width while numbers move, so counts are rendered
 * with tabular figures and capped at four characters. A score that grows from
 * 999 to 1000 must not reflow the action bar.
 */
export function formatCount(value: number): string {
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);
  if (n < 1000) return `${sign}${n}`;
  if (n < 10_000) {
    const tenths = Math.floor(n / 100) / 10;
    // 1.0k reads as a rounding artefact; 1k is what a person would write.
    return `${sign}${tenths % 1 === 0 ? tenths.toFixed(0) : tenths.toFixed(1)}k`;
  }
  if (n < 1_000_000) return `${sign}${Math.round(n / 1000)}k`;
  const millions = Math.floor(n / 100_000) / 10;
  return `${sign}${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}m`;
}

/**
 * Twitter-style compact timestamps: "4h", "3d", then a calendar date.
 *
 * The feed header packs name, handle, space and time onto one line, so the
 * timestamp has to stay short. `formatRelativeTime` in lib/utils spells it out
 * ("4 hours ago"), which is right for a post page and too long for here.
 */
export function formatShortTime(value: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - value.getTime()) / 1000);
  if (seconds < 45) return "now";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  const days = Math.round(seconds / 86_400);
  if (days < 7) return `${days}d`;
  const sameYear = value.getFullYear() === now.getFullYear();
  return value.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
