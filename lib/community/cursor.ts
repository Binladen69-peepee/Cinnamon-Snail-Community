/**
 * Feed cursors.
 *
 * A cursor names the last row of the page you just read, so the next page can
 * be found with a seek rather than by counting past everything before it.
 * Offset pagination gets slower the further you scroll and skips or repeats
 * rows whenever something is inserted mid-scroll; a feed is the worst case for
 * both, because things are inserted constantly.
 *
 * Every sort orders by a value and then by id, because the value alone is not
 * unique — two posts can share a score, and two can be published in the same
 * millisecond. The id is the tiebreak that makes the total order strict, which
 * is what stops a row being served twice or skipped at a page boundary.
 */

export type SortValue = Date | number;

export type FeedCursor = {
  /** The ordering value of the last row served. */
  value: SortValue;
  id: string;
};

export function encodeFeedCursor(value: SortValue, id: string): string {
  const encoded =
    value instanceof Date ? `d:${value.toISOString()}` : `n:${value}`;
  return Buffer.from(`${encoded}::${id}`).toString("base64url");
}

export function decodeFeedCursor(cursor: string): FeedCursor {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  // The first separator, not the last: the ordering value can never contain
  // one, but an id is opaque and might.
  const separator = raw.indexOf("::");
  if (separator === -1) throw new Error("Invalid cursor");
  const head = raw.slice(0, separator);
  const id = raw.slice(separator + 2);
  if (!id) throw new Error("Invalid cursor");

  if (head.startsWith("d:")) {
    const value = new Date(head.slice(2));
    if (Number.isNaN(value.getTime())) throw new Error("Invalid cursor");
    return { value, id };
  }
  if (head.startsWith("n:")) {
    const value = Number(head.slice(2));
    if (!Number.isFinite(value)) throw new Error("Invalid cursor");
    return { value, id };
  }
  throw new Error("Invalid cursor");
}

/**
 * Reads a cursor without trusting it.
 *
 * A cursor arrives in a URL, so it is attacker-controlled and routinely
 * mangled by link shorteners and mail clients. A bad one means "start at the
 * beginning", never an error page: the reader wanted the feed, and the feed is
 * still there.
 */
export function safeDecodeFeedCursor(
  cursor: string | undefined | null,
): FeedCursor | null {
  if (!cursor) return null;
  try {
    return decodeFeedCursor(cursor);
  } catch {
    return null;
  }
}
