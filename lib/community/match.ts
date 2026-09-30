/**
 * Case-insensitive "does any of these fields contain the query".
 *
 * Shared by the class library and the message-start picker. It used to live in
 * the Discover library, which is gone — this was the one thing in it that other
 * code depended on, so it kept its behaviour and lost its neighbours.
 */
export function matchesQuery(
  haystack: (string | null | undefined)[],
  q: string,
): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return haystack.some((value) => value?.toLowerCase().includes(needle));
}
