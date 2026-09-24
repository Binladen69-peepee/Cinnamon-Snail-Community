import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { gateLesson, membershipState } from "@/lib/learn/access";
import { getUserAuth } from "@/lib/community/viewer";
import { isStaff } from "@/lib/permissions";
import { verifyPlaybackToken } from "@/lib/learn/playback";
import { fetchUpstream, isAbsoluteUrl, passthroughHeaders } from "@/lib/learn/media";
import { signedReadUrl } from "@/lib/uploads/storage";

/**
 * The bytes of a paid lesson, streamed through us.
 *
 * This used to answer with a 302 to the asset's real address, which put a
 * permanent, ungated, shareable URL into the browser's network log and
 * history. The brief is explicit that this must never happen, so the bytes
 * come through here instead and the origin stays on the server.
 *
 * The token is not a credential on its own. It says which lesson and which
 * member, and the request must *also* carry that member's session — otherwise
 * a copied URL would play for anyone who had it, for as long as it lasted.
 * Entitlement is checked here too, not only when the token was minted, so a
 * membership that lapses mid-video stops the next range request rather than
 * the next page load.
 *
 * Range is forwarded both ways. Without it a browser cannot seek, and on a
 * phone that is the difference between a player and a progress bar.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const payload = verifyPlaybackToken(token);
  if (!payload) {
    return new Response("That playback link has expired. Reload the lesson.", {
      status: 401,
      headers: { "cache-control": "private, no-store" },
    });
  }

  // The token names a member; the request has to be that member.
  const session = await auth();
  if (!session?.user.id || session.user.id !== payload.userId) {
    return new Response("Sign in to watch this lesson.", {
      status: 401,
      headers: { "cache-control": "private, no-store" },
    });
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: payload.lessonId },
    select: {
      kind: true,
      published: true,
      isPreview: true,
      videoUid: true,
      audioUid: true,
      downloadUid: true,
      liveUrl: true,
      body: true,
      section: { select: { course: { select: { published: true } } } },
    },
  });
  if (!lesson || !lesson.section.course.published) {
    return new Response("That lesson is gone.", { status: 404 });
  }

  const viewer = await getUserAuth(session.user.id);
  const gate = gateLesson({
    lesson,
    membership: await membershipState(session.user.id),
    isStaff: viewer ? isStaff(viewer) : false,
  });
  if (gate.state === "locked") {
    return new Response("Your membership does not cover this lesson.", {
      status: 403,
      headers: { "cache-control": "private, no-store" },
    });
  }
  if (gate.state === "unavailable") {
    return new Response("That lesson is gone.", { status: 404 });
  }

  const uid =
    lesson.kind === "AUDIO"
      ? lesson.audioUid
      : lesson.kind === "DOWNLOAD"
        ? lesson.downloadUid
        : lesson.videoUid;
  if (!uid) return new Response("No media.", { status: 404 });

  // A bucket key is signed for one fetch; an absolute URL is fetched as it is.
  // Either way the address stays here.
  const origin = isAbsoluteUrl(uid) ? uid : await signedReadUrl(uid);
  if (!origin) {
    return new Response("That media could not be reached.", { status: 502 });
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstream(origin, request.headers.get("range"));
  } catch {
    return new Response("That media could not be reached.", { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    // Whatever the origin's problem is, the member's browser should not be
    // asked to interpret it.
    return new Response("That media could not be reached.", {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: passthroughHeaders(upstream),
  });
}
