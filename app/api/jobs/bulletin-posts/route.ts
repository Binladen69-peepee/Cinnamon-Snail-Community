import { NextResponse } from "next/server";
import { jobRequestAuthorized } from "@/lib/jobs/auth";
import { backfillBulletinPosts } from "@/lib/bulletin/posts";

/**
 * Makes sure every live Bulletin Board item has its Kitchen Table post
 * (DEC-078).
 *
 * New items get theirs the moment they go live, in the same transaction, so
 * this is the net under that: items that went live before the Kitchen Table
 * carried them, and any item whose post its author deleted. Idempotent, so
 * running it daily, after a deploy, or twice at once writes each post once.
 *
 * Gated by the same secret as every other `/api/jobs/*` route.
 */
export async function POST(request: Request) {
  if (!jobRequestAuthorized(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const result = await backfillBulletinPosts();
  return NextResponse.json({ ok: true, ...result });
}

/** Vercel Cron issues a GET, so the same work is reachable both ways. */
export async function GET(request: Request) {
  return POST(request);
}
