import { consumeRateLimit } from "@/lib/auth/rate-limit";

/**
 * What one member may do per window.
 *
 * These are not anti-abuse in the adversarial sense — a determined attacker
 * with many accounts is a moderation problem, not a counting problem. They are
 * here to bound the damage one account can do in a minute: a script that
 * reacts to every post in the community, a stuck submit button that files the
 * same post forty times, a report loop.
 *
 * The numbers are deliberately far above what a person does by hand. Anything
 * tight enough to inconvenience a real member is tuned wrong, because the cost
 * of a false positive here is someone being told they cannot talk.
 */
export const COMMUNITY_LIMITS = {
  post: { limit: 15, windowMs: 10 * 60 * 1000 },
  comment: { limit: 60, windowMs: 10 * 60 * 1000 },
  reaction: { limit: 200, windowMs: 10 * 60 * 1000 },
  vote: { limit: 300, windowMs: 10 * 60 * 1000 },
  bookmark: { limit: 120, windowMs: 10 * 60 * 1000 },
  report: { limit: 20, windowMs: 60 * 60 * 1000 },
  upload: { limit: 60, windowMs: 10 * 60 * 1000 },
  share: { limit: 20, windowMs: 60 * 60 * 1000 },
} as const;

export type CommunityAction = keyof typeof COMMUNITY_LIMITS;

export class RateLimitedError extends Error {
  readonly retryAfterMs: number;
  constructor(action: CommunityAction, retryAfterMs: number) {
    super(MESSAGES[action]);
    this.name = "RateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

const MESSAGES: Record<CommunityAction, string> = {
  post: "You have posted a lot in a short time. Take a breath and try again shortly.",
  comment: "That is a lot of comments at once. Try again in a few minutes.",
  reaction: "Slow down a moment — too many reactions at once.",
  vote: "Slow down a moment — too many votes at once.",
  bookmark: "Too many saves at once. Try again in a few minutes.",
  report: "You have filed several reports already. The team will get to them.",
  upload: "Too many uploads at once. Try again in a few minutes.",
  share: "You have shared a lot recently. Try again a bit later.",
};

/**
 * Consumes one unit of a member's allowance, or throws.
 *
 * Throwing rather than returning a flag is deliberate: every caller is a
 * mutation that must not proceed, and a boolean that someone forgets to check
 * is a limit that silently does nothing.
 */
export async function guardCommunityAction(
  action: CommunityAction,
  userId: string,
): Promise<void> {
  const rule = COMMUNITY_LIMITS[action];
  const result = await consumeRateLimit(
    `community:${action}:${userId}`,
    rule.limit,
    rule.windowMs,
  );
  if (!result.ok) {
    throw new RateLimitedError(action, result.retryAfterMs);
  }
}
