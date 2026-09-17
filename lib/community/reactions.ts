/**
 * LinkedIn-style reaction set for the feed picker and summary chips.
 *
 * `emoji` is the stored value so existing rows keep counting; `tone` drives the
 * coloured circle in the hover picker and the stacked summary icons.
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
  | "lightbulb"
  | "frown"
  | "angry";

export type ReactionTone =
  | "like"
  | "celebrate"
  | "support"
  | "love"
  | "insightful"
  | "funny"
  | "neutral";

export type ReactionDef = {
  emoji: string;
  label: string;
  icon: ReactionIcon;
  tone: ReactionTone;
};

/** Offered in the picker, LinkedIn order. */
export const FEED_REACTIONS: ReactionDef[] = [
  { emoji: "👍", label: "Like", icon: "thumbsUp", tone: "like" },
  { emoji: "🎉", label: "Celebrate", icon: "partyPopper", tone: "celebrate" },
  { emoji: "🤗", label: "Support", icon: "heartHandshake", tone: "support" },
  { emoji: "❤️", label: "Love", icon: "heart", tone: "love" },
  { emoji: "💡", label: "Insightful", icon: "lightbulb", tone: "insightful" },
  { emoji: "😆", label: "Funny", icon: "laugh", tone: "funny" },
];

/** Legacy stored values, still rendered so old reactions keep their meaning. */
export const LEGACY_REACTIONS: ReactionDef[] = [
  { emoji: "🙌", label: "Helpful", icon: "handHelping", tone: "celebrate" },
  { emoji: "🤔", label: "Curious", icon: "circleHelp", tone: "insightful" },
  { emoji: "😮", label: "Wow", icon: "zap", tone: "insightful" },
  { emoji: "😢", label: "Sad", icon: "frown", tone: "neutral" },
  { emoji: "😡", label: "Angry", icon: "angry", tone: "love" },
];

export const ALL_REACTIONS: ReactionDef[] = [
  ...FEED_REACTIONS,
  ...LEGACY_REACTIONS,
];

/** Default one-click reaction (LinkedIn primary). */
export const DEFAULT_REACTION = "👍";

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

export const REACTION_TONE_CLASS: Record<ReactionTone, string> = {
  like: "bg-[#378fe9] text-white",
  celebrate: "bg-[#6dae4f] text-white",
  support: "bg-[#bba9d1] text-white",
  love: "bg-[#df704d] text-white",
  insightful: "bg-[#f5bb5c] text-[#1a1a1a]",
  funny: "bg-[#5c9d91] text-white",
  neutral: "bg-[#6b7280] text-white",
};
