import { prisma } from "@/lib/db";
import { userHasActiveEntitlement } from "@/lib/entitlements/server";
import { verifyPlaybackToken } from "@/lib/learn/playback";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const payload = verifyPlaybackToken(token);
  if (!payload) {
    return new Response("Playback expired. Refresh the lesson.", { status: 401 });
  }
  const allowed = await userHasActiveEntitlement(payload.userId);
  if (!allowed) {
    return new Response("Membership required.", { status: 403 });
  }
  const lesson = await prisma.lesson.findUnique({ where: { id: payload.lessonId } });
  if (!lesson?.videoUid) {
    return new Response("No video.", { status: 404 });
  }
  if (!/^https?:\/\//i.test(lesson.videoUid)) {
    return new Response("Cloudflare Stream is not configured for this lesson.", { status: 503 });
  }
  return Response.redirect(lesson.videoUid, 302);
}
