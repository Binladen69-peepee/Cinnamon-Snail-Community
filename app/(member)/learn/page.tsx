import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { memberCanPlayLessons } from "@/lib/learn/access";
import { getContinueLearning, listPublishedCourses } from "@/lib/learn/catalog";
import { prisma } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";

export default async function LearnPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const [courses, canPlay, continuing] = await Promise.all([
    listPublishedCourses(),
    memberCanPlayLessons(session.user.id),
    getContinueLearning(session.user.id),
  ]);
  const continueCards = await Promise.all(
    continuing.map(async (row) => {
      const lesson = row.lastLessonId
        ? await prisma.lesson.findUnique({
            where: { id: row.lastLessonId },
            select: { slug: true, title: true, section: { select: { course: { select: { slug: true } } } } },
          })
        : null;
      return { row, lesson };
    }),
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-olive">Courses</p>
        <h1 className="mt-2 font-display text-4xl text-forest">Cooking school energy. No intimidating LMS.</h1>
        <p className="prose-measure mt-3 text-foreground-muted">
          Short lessons that end in a plate. You always see what to cook next, how long it takes, and where the table is talking.
        </p>
        {!canPlay ? (
          <p className="mt-4 text-sm text-foreground-muted">
            You can browse the catalog. Playback stays behind an active membership entitlement.
          </p>
        ) : null}
      </header>

      {continueCards.length > 0 && canPlay ? (
        <section className="vu-card p-6">
          <h2 className="font-display text-2xl text-forest">Continue learning</h2>
          <ul className="mt-4 space-y-3">
            {continueCards.map(({ row, lesson }) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-forest">{row.course.title}</p>
                  <p className="text-sm text-foreground-muted">
                    {row.percent}% complete
                    {lesson ? ` · ${lesson.title}` : ""}
                  </p>
                </div>
                {lesson ? (
                  <ButtonLink href={`/learn/${lesson.section.course.slug}/${lesson.slug}`} size="sm">
                    Resume
                  </ButtonLink>
                ) : (
                  <ButtonLink href={`/learn/${row.course.slug}`} size="sm">
                    Open course
                  </ButtonLink>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {courses.length === 0 ? (
        <EmptyState
          title="No published courses yet"
          body="When a course is published, it will show here with real lessons — not a mocked catalog."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => {
            const lessonCount = course.sections.reduce((sum, section) => sum + section.lessons.length, 0);
            return (
              <li key={course.id}>
                <Link href={`/learn/${course.slug}`} className="vu-card vu-card-hover block overflow-hidden p-3">
                  {course.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={course.coverUrl} alt="" className="aspect-[4/3] w-full rounded-[1.25rem] object-cover" />
                  ) : null}
                  <div className="p-3">
                    <h2 className="font-display text-2xl text-forest">{course.title}</h2>
                    <p className="mt-2 text-sm text-foreground-muted">{course.description}</p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-olive">
                      {lessonCount} lessons
                      {course.instructorName ? ` · ${course.instructorName}` : ""}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
