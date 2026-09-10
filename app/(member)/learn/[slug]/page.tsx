import { auth } from "@/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { flattenLessons, getPublishedCourse } from "@/lib/learn/catalog";
import { memberCanPlayLessons } from "@/lib/learn/access";
import { prisma } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const { slug } = await params;
  const course = await getPublishedCourse(slug);
  if (!course) notFound();
  const lessons = flattenLessons(course);
  const [canPlay, progressRows, courseProgress] = await Promise.all([
    memberCanPlayLessons(session.user.id),
    prisma.lessonProgress.findMany({
      where: { userId: session.user.id, lessonId: { in: lessons.map((item) => item.id) } },
    }),
    prisma.courseProgress.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: session.user.id } },
    }),
  ]);
  const completed = new Set(progressRows.filter((row) => row.completedAt).map((row) => row.lessonId));
  const nextLesson = lessons.find((lesson) => !completed.has(lesson.id)) ?? lessons[0];

  return (
    <article className="space-y-8">
      <header className="vu-card overflow-hidden">
        {course.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.coverUrl} alt="" className="aspect-[2/1] w-full object-cover" />
        ) : null}
        <div className="p-6 md:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-olive">Course</p>
          <h1 className="mt-2 font-display text-4xl text-forest">{course.title}</h1>
          <p className="prose-measure mt-3 text-foreground-muted">{course.description}</p>
          {course.instructorName ? (
            <p className="mt-2 text-sm font-semibold text-forest">With {course.instructorName}</p>
          ) : null}
          <p className="mt-4 text-sm text-foreground-muted">
            {courseProgress?.percent ?? 0}% complete · {lessons.length} lessons
          </p>
          {nextLesson && canPlay ? (
            <ButtonLink href={`/learn/${course.slug}/${nextLesson.slug}`} className="mt-6">
              {courseProgress?.percent ? "Continue" : "Start the first lesson"}
            </ButtonLink>
          ) : (
            <ButtonLink href="/membership" className="mt-6">
              Become a member to play
            </ButtonLink>
          )}
        </div>
      </header>

      {course.resources.length > 0 ? (
        <section className="vu-card p-6">
          <h2 className="font-display text-2xl text-forest">Resources</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {course.resources.map((resource) => (
              <li key={resource.id}>
                <a href={resource.url} className="text-forest underline-offset-2 hover:underline">
                  {resource.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4">
        {course.sections.map((section) => (
          <div key={section.id} className="vu-card p-6">
            <h2 className="font-display text-2xl text-forest">{section.title}</h2>
            <ol className="mt-4 space-y-2">
              {section.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    href={`/learn/${course.slug}/${lesson.slug}`}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-full px-3 py-2 hover:bg-mint"
                  >
                    <span>
                      <span className="font-semibold text-forest">{lesson.title}</span>
                      <span className="ml-2 text-xs uppercase tracking-[0.14em] text-olive">{lesson.kind}</span>
                    </span>
                    <span className="text-sm text-foreground-muted">
                      {completed.has(lesson.id) ? "Done" : lesson.durationMin ? `${lesson.durationMin} min` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>
    </article>
  );
}
