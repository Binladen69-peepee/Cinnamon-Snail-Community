import { NextResponse } from "next/server";
import { jobRequestAuthorized } from "@/lib/jobs/auth";
import {
  backfillMemberInterests,
  syncInterests,
} from "@/lib/community/interest-sync";

/**
 * Put the interest catalog into the database, and the old free text onto it.
 *
 * A deploy that adds a cuisine to `lib/community/interests.ts` has not made
 * that cuisine selectable until this has run, because the picker reads rows
 * and the directory joins against them. Idempotent, so it can be called after
 * every deploy without thinking about it.
 *
 * Secret-gated like every other `/api/jobs/*` route.
 */
export async function POST(request: Request) {
  if (!jobRequestAuthorized(request)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const catalog = await syncInterests();
  // Only when asked: the backfill is a one-time repair, and running it on
  // every deploy would keep re-reading a column nothing writes any more.
  const backfill =
    new URL(request.url).searchParams.get("backfill") === "1"
      ? await backfillMemberInterests()
      : null;

  return NextResponse.json({ ok: true, catalog, backfill });
}

export async function GET(request: Request) {
  return POST(request);
}
