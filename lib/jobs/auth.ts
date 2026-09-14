import "server-only";

/**
 * The shared gate for every `/api/jobs/*` endpoint.
 *
 * These routes are the cron surface described in DEC-011: there is no Inngest
 * yet, so scheduled work is a plain HTTP POST that Vercel Cron (or anything
 * else holding the secret) calls on a timer. That makes them publicly
 * reachable, so they are all secret-gated the same way.
 *
 * `BILLING_JOB_SECRET` is the historical name and stays primary, with
 * `CRON_SECRET` accepted because that is what Vercel Cron sets by default.
 *
 * With no secret configured at all the routes are open in development and
 * closed in production — failing shut is the only safe default once something
 * is reachable from the internet.
 */
export function jobRequestAuthorized(request: Request): boolean {
  const secret = process.env.BILLING_JOB_SECRET ?? process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header =
    request.headers.get("authorization") ?? request.headers.get("x-job-secret");
  return header === `Bearer ${secret}` || header === secret;
}
