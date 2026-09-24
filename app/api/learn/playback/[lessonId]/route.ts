import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { gateLesson, membershipState } from "@/lib/learn/access";
import { getUserAuth } from "@/lib/community/viewer";
import { isStaff } from "@/lib/permissions";
import { signPlaybackToken } from "@/lib/learn/playback";
import { resolveMediaSource } from "@/lib/learn/media";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { lessonChapters } from "@/lib/learn/chapters";

/**
 * Everything the player needs to start, and nothing it does not.
 *
 * The response never contains the asset's real address. It carries either a
 * short-lived signed URL that storage itself will honour, or a path back to
 * our own streaming route — and which of those it is depends on where the
 * asset lives, not on what the caller asks for.
 *
 * Three checks stand between a request and a source: the caller is signed in,
 * the lesson is published inside a published course, and this member may open
 * it. The last one is the same function the page uses, so the player and the
 * page can never disagree about whether something is locked.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ ok: false, error: "signin" }, { status: 401 });
  }

  // Minting is cheap but it reads the database and signs a token, so it is
  // bounded: a script asking for a thousand lesson ids learns nothing useful
  // and costs nothing much.
  const limit = await consumeRateLimit(
    `learn-playback:${session.user.id}`,
    120,
    10 * 60 * 1000,
  );
  if (!limit.ok) {
    return NextResponse.json({ ok: false, error: "slow-down" }, { status: 429 });
  }

  const { lessonId } = await context.params;
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      kind: true,
      published: true,
      isPreview: true,
      videoUid: true,
      audioUid: true,
      downloadUid: true,
      liveUrl: true,
      liveAt: true,
      body: true,
      chapters: true,
      durationMin: true,
      resources: {
        where: { kind: "captions" },
        select: { url: true, title: true },
        take: 4,
      },
      section: {
        select: { course: { select: { published: true, slug: true } } },
      },
    },
  });

  // A lesson inside an unpublished course is not a lesson anyone may reach,
  // whatever its own flag says. Answering "not found" rather than "forbidden"
  // keeps draft course names out of reach too.
  if (!lesson || !lesson.section.course.published) {
    return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
  }

  const viewer = await getUserAuth(session.user.id);
  const gate = gateLesson({
    lesson,
    membership: await membershipState(session.user.id),
    isStaff: viewer ? isStaff(viewer) : false,
  });

  if (gate.state === "unavailable") {
    return NextResponse.json(
      { ok: false, error: gate.reason === "draft" ? "not-found" : "no-media" },
      { status: 404 },
    );
  }
  if (gate.state === "locked") {
    return NextResponse.json(
      { ok: false, error: "entitlement", membership: gate.membership },
      { status: 403 },
    );
  }

  const assetUid =
    lesson.kind === "AUDIO"
      ? lesson.audioUid
      : lesson.kind === "DOWNLOAD"
        ? lesson.downloadUid
        : lesson.videoUid;

  const token = signPlaybackToken({ lessonId: lesson.id, userId: session.user.id });
  const source = await resolveMediaSource(assetUid, token);

  if (source.kind === "missing") {
    return NextResponse.json({ ok: false, error: "no-media" }, { status: 404 });
  }

  const progress = await prisma.lessonProgress.findUnique({
    where: { lessonId_userId: { lessonId: lesson.id, userId: session.user.id } },
    select: { positionSeconds: true, completedAt: true },
  });

  return NextResponse.json(
    {
      ok: true,
      kind: lesson.kind,
      // "proxy" never names the origin; the player just fetches this path.
      src: source.kind === "proxy" ? `/api/learn/media/${token}` : source.url,
      // A Stream player is an iframe rather than a media element.
      embed: source.kind === "stream",
      captionsUrl: lesson.resources[0]?.url ?? null,
      chapters: lessonChapters(lesson.chapters),
      resumeAt: progress?.positionSeconds ?? 0,
      completed: Boolean(progress?.completedAt),
      liveUrl: lesson.kind === "LIVE" ? lesson.liveUrl : null,
      liveAt: lesson.kind === "LIVE" ? lesson.liveAt : null,
    },
    // A signed URL inside a response is as sensitive as the asset it opens.
    { headers: { "cache-control": "private, no-store" } },
  );
}
