/**
 * Day grouping for a conversation.
 *
 * These live apart from `start.ts` because the thread is a client component and
 * `start.ts` is `server-only`: importing one pure function from it would have
 * pulled Prisma into the browser bundle. Typecheck and lint both pass on that
 * mistake -- only the build catches it -- so the split is the guard.
 */

/**
 * Groups messages into day buckets.
 *
 * Chat reads as a continuous column, which stops being legible the moment a
 * thread spans more than one day. Exported and pure so the boundary logic is
 * testable without rendering anything.
 */
export function groupByDay<T extends { createdAt: string | Date }>(
  messages: T[],
): { day: string; label: string; messages: T[] }[] {
  const groups: { day: string; label: string; messages: T[] }[] = [];
  for (const message of messages) {
    const at = new Date(message.createdAt);
    const day = `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
    const last = groups.at(-1);
    if (last?.day === day) last.messages.push(message);
    else groups.push({ day, label: dayLabel(at), messages: [message] });
  }
  return groups;
}

/** "Today" and "Yesterday" beat a date nobody has to decode. */
export function dayLabel(date: Date, now = new Date()): string {
  const midnight = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7 && days > 0) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
