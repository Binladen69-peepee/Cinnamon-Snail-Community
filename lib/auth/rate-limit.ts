import { prisma } from "@/lib/db";

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * The in-process fixed window.
 *
 * Correct, and useless on its own in production: every serverless instance
 * gets its own Map, so a limit of five attempts becomes five per instance. It
 * survives as the fallback for environments with no database, and as the
 * algorithm the durable limiter mirrors.
 */
export function consumeRateLimitLocal(
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
    return { ok: false, remaining: 0, retryAfterMs: current.resetAt - now };
  }
  current.count += 1;
  buckets.set(key, current);
  return { ok: true, remaining: limit - current.count, retryAfterMs: 0 };
}

export function resetRateLimitForTests() {
  buckets.clear();
}

type BucketRow = { count: number; resetAt: Date };

/**
 * The limit that actually holds across instances.
 *
 * One statement does the whole fixed window: insert the bucket, or on conflict
 * either restart it because the window has passed or increment it. Postgres
 * serialises the conflicting updates, so two simultaneous sign-in attempts
 * cannot both read a count of four and both write five, which is the race that
 * makes a read-then-write limiter leak.
 *
 * A limiter must never be the reason nobody can sign in, so a database failure
 * falls back to the in-process window instead of refusing the request.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!process.env.DATABASE_URL) {
    return consumeRateLimitLocal(key, limit, windowMs);
  }
  const resetAt = new Date(Date.now() + windowMs);
  try {
    const rows = await prisma.$queryRaw<BucketRow[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= now() THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= now() THEN ${resetAt}
          ELSE "RateLimitBucket"."resetAt"
        END
      RETURNING "count", "resetAt"
    `;
    const row = rows[0];
    if (!row) return consumeRateLimitLocal(key, limit, windowMs);
    const retryAfterMs = Math.max(0, row.resetAt.getTime() - Date.now());
    if (row.count > limit) {
      return { ok: false, remaining: 0, retryAfterMs };
    }
    return { ok: true, remaining: limit - row.count, retryAfterMs: 0 };
  } catch {
    // Fail open onto the local window. A limiter outage should cost an
    // attacker a little time, not cost every member their sign-in.
    return consumeRateLimitLocal(key, limit, windowMs);
  }
}

/**
 * Expired buckets are dead weight; nothing reads them again. Called
 * opportunistically rather than on a schedule, so the table cannot grow
 * without bound on a deployment that has no cron.
 */
export async function sweepRateLimitBuckets(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await prisma.rateLimitBucket.deleteMany({
      where: { resetAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
    });
  } catch {
    // Housekeeping only.
  }
}
