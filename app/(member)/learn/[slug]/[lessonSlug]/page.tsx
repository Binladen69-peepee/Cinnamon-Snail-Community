import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { flattenLessons, getPublishedCourse } from "@/lib/learn/catalog";
import { memberCanPlayLessons } from "@/lib/learn/access";
import { prisma } from "@/lib/db";
import { LessonPlayer } from "@/components/learn/lesson-player";
import { CommentDisclosure } from "@/components/community/comment-disclosure";
import { completeLessonAction } from "@/app/(member)/learn/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { renderMarkdown } from "@/lib/markdown";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const { slug, lessonSlug } = await params;
  const course = await getPublishedCourse(slug);
  if (!course) notFound();
  const lessons = flattenLessons(course);
  const index = lessons.findIndex((item) => item.slug === lessonSlug);
  const lesson = lessons[index];
  if (!lesson) notFound();
  const next = lessons[index + 1];
  const canPlay = await memberCanPlayLessons(session.user.id);
  const progress = await prisma.lessonProgress.findUnique({
    where: { lessonId_userId: { lessonId: lesson.id, userId: session.user.id } },
  });
  const discussion = await prisma.post.findFirst({
    where: { linkUrl: `vu:lesson:${lesson.id}` },
    select: { id: true },
  });
  const captionsUrl = lesson.resources.find((row) => row.kind === "captions")?.url ?? null;

  return (
    <article className="space-y-6">
      <p className="text-sm">
        <Link href={`/learn/${course.slug}`} className="text-olive hover:text-forest">
          {course.title}
        </Link>
        <span className="text-foreground-muted"> · {lesson.sectionTitle}</span>
      </p>
      <h1 className="font-display text-4xl text-forest">{lesson.title}</h1>
      <p className="text-sm text-foreground-muted">
        {lesson.durationMin ? `${lesson.durationMin} min · ` : ""}
        {lesson.kind}
      </p>

      {!canPlay ? (
        <div className="vu-card p-8">
          <h2 className="font-display text-2xl text-forest">This lesson stays behind membership</h2>
          <p className="mt-3 text-foreground-muted">
            Access checks use entitlements only. Overview is visible; playback is not.
          </p>
          <ButtonLink href="/membership" className="mt-6">
            Become a member
          </ButtonLink>
        </div>
      ) : (
        <>
          {lesson.kind === "video" && lesson.videoUid ? (
            <LessonPlayer
              lessonId={lesson.id}
              startSeconds={progress?.positionSeconds ?? 0}
              captionsUrl={captionsUrl}
            />
          ) : null}
          {lesson.body ? (
            <div
              className="prose-measure text-foreground"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(lesson.body) }}
            />
          ) : null}
          {lesson.resources.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {lesson.resources.map((resource) => (
                <li key={resource.id}>
                  <a href={resource.url} className="text-forest underline-offset-2 hover:underline">
                    {resource.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <form action={completeLessonAction}>
            <input type="hidden" name="lessonId" value={lesson.id} />
            <input type="hidden" name="positionSeconds" value={progress?.positionSeconds ?? 0} />
            <input type="hidden" name="courseSlug" value={course.slug} />
            <input type="hidden" name="nextHref" value={next ? `/learn/${course.slug}/${next.slug}` : `/learn/${course.slug}`} />
            <Button type="submit">Mark complete{next ? " and continue" : ""}</Button>
          </form>
          {next ? (
            <p className="text-sm">
              Next:{" "}
              <Link href={`/learn/${course.slug}/${next.slug}`} className="font-semibold text-forest">
                {next.title}
              </Link>
            </p>
          ) : (
            <p className="text-sm text-foreground-muted">That was the last lesson in this course.</p>
          )}
        </>
      )}

      {discussion && canPlay ? (
        <section className="vu-card p-6">
          <h2 className="font-display text-2xl text-forest">Kitchen Table for this lesson</h2>
          <p className="mt-2 text-sm text-foreground-muted">Ask the sauce question here. Names stay on the comments.</p>
          <div className="mt-4">
            <CommentDisclosure
              postId={discussion.id}
              viewer={{
                name: session.user.name || session.user.handle,
                avatar: session.user.image ?? null,
              }}
            />
          </div>
        </section>
      ) : null}
    </article>
  );
}
