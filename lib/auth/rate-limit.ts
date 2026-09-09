type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  if (current.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: current.resetAt - now,
    };
  }
  current.count += 1;
  buckets.set(key, current);
  return {
    ok: true,
    remaining: limit - current.count,
    retryAfterMs: 0,
  };
}

export function resetRateLimitForTests() {
  buckets.clear();
}
