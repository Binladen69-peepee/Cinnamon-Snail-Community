/**
 * Chapter markers.
 *
 * Stored as JSON on the lesson because they are a list the admin types, not
 * something anything queries. Read back through here so a hand-edited or
 * half-written value cannot reach the player as something it will crash on:
 * anything that is not a sane marker is dropped rather than rendered.
 */

export type Chapter = {
  /** Where the chapter starts, in seconds from the beginning. */
  atSeconds: number;
  title: string;
};

const MAX_CHAPTERS = 60;

export function lessonChapters(value: unknown): Chapter[] {
  if (!Array.isArray(value)) return [];
  const out: Chapter[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const at = Number(record.atSeconds);
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!Number.isFinite(at) || at < 0 || !title) continue;
    out.push({ atSeconds: Math.floor(at), title: title.slice(0, 120) });
    if (out.length >= MAX_CHAPTERS) break;
  }
  // In order, and never two at the same second: the player seeks by index and
  // a duplicate marker is a button that appears to do nothing.
  out.sort((a, b) => a.atSeconds - b.atSeconds);
  return out.filter(
    (row, index) => index === 0 || row.atSeconds !== out[index - 1]!.atSeconds,
  );
}

/**
 * Parses the admin's textarea: one chapter per line, `0:00 Title`.
 *
 * Timestamps may be `m:ss` or `h:mm:ss` or a plain number of seconds, because
 * all three are what people actually type.
 */
export function parseChapters(input: string): Chapter[] {
  const rows: Chapter[] = [];
  for (const rawLine of input.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^(\d+(?::\d{1,2}){0,2})\s+(.*)$/.exec(line);
    if (!match) continue;
    const title = match[2]!.trim();
    if (!title) continue;
    const parts = match[1]!.split(":").map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) continue;
    const atSeconds = parts.reduce((total, part) => total * 60 + part, 0);
    rows.push({ atSeconds, title: title.slice(0, 120) });
  }
  return lessonChapters(rows);
}

/** `0:00`, or `1:02:03` once past an hour. */
export function formatChapterTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}
