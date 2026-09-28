import "server-only";
import { consumeRateLimit } from "@/lib/auth/rate-limit";

/**
 * What one member may do to the messaging system per window.
 *
 * Messaging had none of this. Every other mutation in the app is bounded —
 * `lib/community/rate-limits.ts` covers posts, comments, reactions, reports —
 * and the one surface that can write directly into somebody else's inbox was
 * unbounded. The typing ping was the worst of it: an endpoint that takes a
 * write on every keystroke, with nothing counting.
 *
 * As elsewhere, the numbers sit far above what a person does by hand. The
 * point is to bound what one account can do in a minute, not to police
 * conversation: a limit tight enough to interrupt a real argument between two
 * friends is tuned wrong.
 */
export const MESSAGE_LIMITS = {
  /** Sending. Fast typists in a heated thread stay well under this. */
  send: { limit: 120, windowMs: 5 * 60 * 1000 },
  /** Starting threads, which is the one that costs other people attention. */
  start: { limit: 20, windowMs: 60 * 60 * 1000 },
  /** Typing pings. The client throttles to one every few seconds anyway. */
  typing: { limit: 300, windowMs: 5 * 60 * 1000 },
  /** Blocking and reporting. Rare by nature; a loop here is not a person. */
  moderate: { limit: 40, windowMs: 60 * 60 * 1000 },
} as const;

export type MessageAction = keyof typeof MESSAGE_LIMITS;

const MESSAGES: Record<MessageAction, string> = {
  send: "That is a lot of messages at once. Give it a minute.",
  start: "You have started a lot of conversations. Try again a little later.",
  typing: "Slow down a moment.",
  moderate: "That is a lot of moderation at once. Try again shortly.",
};

export class MessageRateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(action: MessageAction, retryAfterMs: number) {
    super(MESSAGES[action]);
    this.name = "MessageRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Throws when the member is over the limit.
 *
 * Keyed per member per action, on the durable Postgres limiter (DEC-040), so
 * the allowance is the member's rather than one allowance per serverless
 * instance.
 */
export async function guardMessageAction(
  action: MessageAction,
  userId: string,
): Promise<void> {
  const { limit, windowMs } = MESSAGE_LIMITS[action];
  const result = await consumeRateLimit(`messages:${action}:${userId}`, limit, windowMs);
  if (!result.ok) {
    throw new MessageRateLimitError(action, result.retryAfterMs);
  }
}
