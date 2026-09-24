import { NextResponse } from "next/server";
import { jobRequestAuthorized } from "@/lib/jobs/auth";
import { publishDuePosts } from "@/lib/community/posts";
import { sweepRateLimitBuckets } from "@/lib/auth/rate-limit";

/**
 * Publishes scheduled posts whose time has come.
 *
 * Scheduling only means something if something later does the publishing. A
 * post with a future `scheduledAt` and no runner is a post that never appears,
 * which is worse than not offering scheduling at all.
 *
 * Called on a timer by Vercel Cron and gated by the same secret as the other
 * job routes. The Hobby plan allows one cron run a day, so `vercel.json` asks
 * for a daily one; anything finer needs Vercel Pro or an external scheduler
 * calling this with the job secret. The endpoint itself does not care how
 * often it runs. It is safe to call twice: each post is claimed with a
 * conditional update, so two overlapping runs cannot both publish it and
 * cannot both notify a space about it.
 *
 * The rate-limit sweep rides along because it needs a timer too and one run a
 * minute is more than enough for both.
 */
export async function POST(request: Request) {
  if (!jobRequestAuthorized(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const result = await publishDuePosts(50);
  await sweepRateLimitBuckets();
  return NextResponse.json(result);
}

/**
 * Vercel Cron issues a GET, so the same work is reachable both ways rather
 * than depending on which verb the scheduler happens to use.
 */
export async function GET(request: Request) {
  return POST(request);
}
