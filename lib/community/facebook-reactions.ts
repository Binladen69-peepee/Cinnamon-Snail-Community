export const FEED_REACTIONS = [
  { emoji: "❤️", label: "Love" },
  { emoji: "👍", label: "Like" },
  { emoji: "🎉", label: "Celebrate" },
  { emoji: "🙌", label: "Helpful" },
  { emoji: "🤔", label: "Curious" },
] as const;

/** Includes legacy stored values so existing reactions still count. */
export const FACEBOOK_REACTIONS = [
  ...FEED_REACTIONS,
  { emoji: "🤗", label: "Care" },
  { emoji: "😆", label: "Haha" },
  { emoji: "😮", label: "Wow" },
  { emoji: "😢", label: "Sad" },
  { emoji: "😡", label: "Angry" },
] as const;

export type FacebookEmoji = (typeof FACEBOOK_REACTIONS)[number]["emoji"];

const allowed = new Set<string>(FACEBOOK_REACTIONS.map((item) => item.emoji));

export function isFacebookReaction(emoji: string): emoji is FacebookEmoji {
  return allowed.has(emoji);
}

export function summarizeReactions(
  rows: { emoji: string; userId: string }[],
  userId: string,
): { counts: Record<string, number>; myReaction: string | null; total: number } {
  const counts: Record<string, number> = {};
  let myReaction: string | null = null;
  for (const row of rows) {
    counts[row.emoji] = (counts[row.emoji] ?? 0) + 1;
    if (row.userId === userId) myReaction = row.emoji;
  }
  return {
    counts,
    myReaction,
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
  };
}
