import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { IdeaError } from "@/lib/ideas/errors";

/**
 * How much one member may do on the board per window.
 *
 * Same philosophy as the community limits (lib/community/rate-limits.ts): far
 * above what a person does by hand, there to bound what a stuck button or a
 * script can do in a minute. They live in their own buckets so a busy evening
 * in the Kitchen Table never eats into anyone's ideas allowance, and the other
 * way round.
 */
export const IDEA_LIMITS = {
  submit: {
    limit: 8,
    windowMs: 60 * 60 * 1000,
    message: "You have shared a lot of ideas in the last hour. Give it a little while and try again.",
  },
  vote: {
    limit: 120,
    windowMs: 10 * 60 * 1000,
    message: "That is a lot of votes at once. Try again in a few minutes.",
  },
  edit: {
    limit: 30,
    windowMs: 10 * 60 * 1000,
    message: "That is a lot of edits at once. Try again in a few minutes.",
  },
  /** The look-up the form runs while a title is typed. */
  lookup: {
    limit: 240,
    windowMs: 10 * 60 * 1000,
    message: "Too many searches at once. Try again in a few minutes.",
  },
} as const;

export type IdeaAction = keyof typeof IDEA_LIMITS;

export function ideaLimitKey(action: IdeaAction, userId: string): string {
  return `ideas:${action}:${userId}`;
}

/** Consumes one unit of the member's allowance, or throws `rate_limited`. */
export async function guardIdeaAction(action: IdeaAction, userId: string): Promise<void> {
  const rule = IDEA_LIMITS[action];
  const result = await consumeRateLimit(ideaLimitKey(action, userId), rule.limit, rule.windowMs);
  if (!result.ok) throw new IdeaError("rate_limited", rule.message);
}
