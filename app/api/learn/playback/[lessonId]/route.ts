import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { memberCanPlayLessons } from "@/lib/learn/access";
import { signPlaybackToken } from "@/lib/learn/playback";

export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  const session = await auth();
  if (!session?.user.id) {
    return Response.json({ ok: false, error: "signin" }, { status: 401 });
  }
  const { lessonId } = await context.params;
  const allowed = await memberCanPlayLessons(session.user.id);
  if (!allowed) {
    return Response.json({ ok: false, error: "entitlement" }, { status: 403 });
  }
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { resources: true },
  });
  if (!lesson?.videoUid) {
    return Response.json({ ok: false, error: "no-video" }, { status: 404 });
  }
  const token = signPlaybackToken({ lessonId, userId: session.user.id });
  return Response.json({
    ok: true,
    src: `/api/learn/media/${token}`,
    captionsUrl: lesson.resources.find((row) => row.kind === "captions")?.url ?? null,
  });
}
