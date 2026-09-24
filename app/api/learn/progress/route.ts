import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveLessonProgress, ProgressError } from "@/lib/learn/progress";
import { consumeRateLimit } from "@/lib/auth/rate-limit";

/**
 * Where the member got to.
 *
 * A route rather than a server action because the player calls it from a
 * `beforeunload` handler with `navigator.sendBeacon`, and a beacon can only
 * POST to a URL. It is also called every fifteen seconds while something is
 * playing, which is why it does as little as possible.
 *
 * The member id is taken from the session and never from the body: the body
 * only says which lesson and how far. Authorisation for that lesson happens
 * inside `saveLessonProgress`, so a member cannot record progress against
 * something they could not open.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  }

  // Generous: a fifteen-second heartbeat across a few open tabs is normal.
  // This is here to stop a runaway loop, not to ration honest saving.
  const limit = await consumeRateLimit(
    `learn-progress:${session.user.id}`,
    600,
    10 * 60 * 1000,
  );
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "slow-down" }, { status: 429 });
  }

  let body: {
    lessonId?: unknown;
    positionSeconds?: unknown;
    durationSeconds?: unknown;
    completed?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400 });
  }

  const lessonId = typeof body.lessonId === "string" ? body.lessonId : "";
  if (!lessonId) {
    return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400 });
  }

  try {
    const result = await saveLessonProgress({
      userId: session.user.id,
      lessonId,
      positionSeconds: Number(body.positionSeconds) || 0,
      durationSeconds:
        Number.isFinite(Number(body.durationSeconds)) && Number(body.durationSeconds) > 0
          ? Number(body.durationSeconds)
          : null,
      completed: body.completed === true,
    });
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof ProgressError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 403 },
      );
    }
    console.error("[learn] progress save failed");
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
