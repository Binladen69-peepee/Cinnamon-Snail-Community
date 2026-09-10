/**
 * The reaction set, with one distinct icon per reaction.
 *
 * The previous map pointed "Helpful" at a bookmark icon and collapsed Curious,
 * Wow, Sad and Angry onto a single question mark, so four different reactions
 * rendered identically. Every entry here has its own glyph.
 *
 * `emoji` stays the stored value so existing rows keep counting; the icon name
 * is what the UI renders.
 */
export type ReactionIcon =
  | "heart"
  | "thumbsUp"
  | "partyPopper"
  | "handHelping"
  | "circleHelp"
  | "heartHandshake"
  | "laugh"
  | "zap"
  | "frown"
  | "angry";

export type ReactionDef = {
  emoji: string;
  label: string;
  icon: ReactionIcon;
};

/** Offered in the picker, in this order. */
export const FEED_REACTIONS: ReactionDef[] = [
  { emoji: "❤️", label: "Love", icon: "heart" },
  { emoji: "👍", label: "Like", icon: "thumbsUp" },
  { emoji: "🎉", label: "Celebrate", icon: "partyPopper" },
  { emoji: "🙌", label: "Helpful", icon: "handHelping" },
  { emoji: "🤔", label: "Curious", icon: "circleHelp" },
];

/** Legacy stored values, still rendered so old reactions keep their meaning. */
export const LEGACY_REACTIONS: ReactionDef[] = [
  { emoji: "🤗", label: "Care", icon: "heartHandshake" },
  { emoji: "😆", label: "Haha", icon: "laugh" },
  { emoji: "😮", label: "Wow", icon: "zap" },
  { emoji: "😢", label: "Sad", icon: "frown" },
  { emoji: "😡", label: "Angry", icon: "angry" },
];

export const ALL_REACTIONS: ReactionDef[] = [
  ...FEED_REACTIONS,
  ...LEGACY_REACTIONS,
];

const byEmoji = new Map(ALL_REACTIONS.map((item) => [item.emoji, item]));

export function reactionFor(emoji: string | null | undefined): ReactionDef | null {
  if (!emoji) return null;
  return byEmoji.get(emoji) ?? null;
}

export function isReaction(emoji: string): boolean {
  return byEmoji.has(emoji);
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

/** Top reactions present on a post, for the summary chips. */
export function topReactions(
  counts: Record<string, number>,
  limit = 3,
): { def: ReactionDef; count: number }[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .flatMap(([emoji, count]) => {
      const def = reactionFor(emoji);
      return def ? [{ def, count }] : [];
    });
}
