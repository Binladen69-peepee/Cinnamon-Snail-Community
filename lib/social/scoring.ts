export type MemberSignals = {
  userId: string;
  displayName: string;
  interests: string[];
  skillLevel: string | null;
  timezone: string | null;
  spaceIds: string[];
  /** Lessons completed, used as a rough "where are you in the work" signal. */
  lessonsCompleted: number;
  lastActiveAt: Date | null;
  /** Conversations or comment replies already exchanged with the viewer. */
  priorInteractions: number;
};

export type Suggestion = {
  userId: string;
  displayName: string;
  score: number;
  reason: string;
  starter: string;
  sharedInterests: string[];
};

/**
 * Weights are deliberately small integers so a reason string can always be
 * traced back to the signal that earned it. BUILD.md §12.2 names the inputs;
 * the relative order here is the only judgement call.
 */
export const WEIGHTS = {
  sharedInterest: 12,
  sharedSpace: 8,
  sameSkill: 6,
  sameTimezone: 5,
  similarProgress: 7,
  recentlyActive: 6,
  priorInteractionPenalty: 15,
} as const;

const RECENT_DAYS = 14;
const PROGRESS_BAND = 3;

export function overlap(a: string[], b: string[]): string[] {
  const normalized = new Set(b.map((item) => item.trim().toLowerCase()));
  const seen = new Set<string>();
  return a.filter((item) => {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key) || !normalized.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function daysSince(date: Date | null, now: Date): number {
  if (!date) return Number.POSITIVE_INFINITY;
  return (now.getTime() - date.getTime()) / 86_400_000;
}

export function scoreCandidate(
  viewer: MemberSignals,
  candidate: MemberSignals,
  now = new Date(),
): Suggestion {
  const sharedInterests = overlap(viewer.interests, candidate.interests);
  const sharedSpaces = overlap(viewer.spaceIds, candidate.spaceIds);
  const sameSkill =
    Boolean(viewer.skillLevel) &&
    viewer.skillLevel?.toLowerCase() === candidate.skillLevel?.toLowerCase();
  const sameTimezone =
    Boolean(viewer.timezone) && viewer.timezone === candidate.timezone;
  const similarProgress =
    Math.abs(viewer.lessonsCompleted - candidate.lessonsCompleted) <= PROGRESS_BAND;
  const recentlyActive = daysSince(candidate.lastActiveAt, now) <= RECENT_DAYS;

  let score = 0;
  score += sharedInterests.length * WEIGHTS.sharedInterest;
  score += sharedSpaces.length * WEIGHTS.sharedSpace;
  if (sameSkill) score += WEIGHTS.sameSkill;
  if (sameTimezone) score += WEIGHTS.sameTimezone;
  if (similarProgress) score += WEIGHTS.similarProgress;
  if (recentlyActive) score += WEIGHTS.recentlyActive;
  // People you already talk to are not a discovery.
  score -= candidate.priorInteractions * WEIGHTS.priorInteractionPenalty;

  return {
    userId: candidate.userId,
    displayName: candidate.displayName,
    score,
    reason: buildReason({
      sharedInterests,
      sharedSpaceCount: sharedSpaces.length,
      sameSkill,
      sameTimezone,
      similarProgress,
      recentlyActive,
    }),
    starter: buildStarter(sharedInterests, candidate.displayName, similarProgress),
    sharedInterests,
  };
}

function buildReason(input: {
  sharedInterests: string[];
  sharedSpaceCount: number;
  sameSkill: boolean;
  sameTimezone: boolean;
  similarProgress: boolean;
  recentlyActive: boolean;
}): string {
  const reasons: string[] = [];
  if (input.sharedInterests.length > 0) {
    reasons.push(`you both cook ${input.sharedInterests.slice(0, 2).join(" and ")}`);
  }
  if (input.sharedSpaceCount > 0) {
    reasons.push(
      input.sharedSpaceCount === 1
        ? "you share a space"
        : `you share ${input.sharedSpaceCount} spaces`,
    );
  }
  if (input.similarProgress) reasons.push("you are at a similar point in the courses");
  if (input.sameSkill) reasons.push("you are cooking at the same level");
  if (input.sameTimezone) reasons.push("you are in the same timezone");
  if (reasons.length === 0 && input.recentlyActive) {
    reasons.push("they have been cooking here this week");
  }
  if (reasons.length === 0) return "New to the same kitchen.";
  const sentence = reasons.slice(0, 3).join(", ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

function buildStarter(
  sharedInterests: string[],
  name: string,
  similarProgress: boolean,
): string {
  const firstName = name.split(" ")[0];
  if (sharedInterests.length > 0) {
    return `Ask ${firstName} what they last made with ${sharedInterests[0]}.`;
  }
  if (similarProgress) {
    return `Ask ${firstName} which lesson finally clicked for them.`;
  }
  return `Ask ${firstName} what is on their plate this week.`;
}

export function rankSuggestions(
  viewer: MemberSignals,
  candidates: MemberSignals[],
  limit = 5,
  now = new Date(),
): Suggestion[] {
  return candidates
    .filter((candidate) => candidate.userId !== viewer.userId)
    .map((candidate) => scoreCandidate(viewer, candidate, now))
    .filter((suggestion) => suggestion.score > 0)
    .sort((a, b) =>
      b.score === a.score
        ? a.displayName.localeCompare(b.displayName)
        : b.score - a.score,
    )
    .slice(0, limit);
}

/** Monday 00:00 UTC of the week containing `date`. Matches run weekly. */
export function weekStart(date = new Date()): Date {
  const copy = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const weekday = copy.getUTCDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  copy.setUTCDate(copy.getUTCDate() - offset);
  return copy;
}
