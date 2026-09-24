import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Lock,
  MessageSquare,
} from "lucide-react";
import { auth } from "@/auth";
import { getLessonPage } from "@/lib/learn/lesson";
import { renderMarkdown } from "@/lib/markdown";
import { AppShell } from "@/components/app/app-shell";
import { LessonPlayer } from "@/components/learn/lesson-player";
import { LessonSyllabus } from "@/components/learn/lesson-syllabus";
import {
  CompleteButton,
  ReflectionForm,
} from "@/components/learn/lesson-actions-bar";
import { LessonDiscussion } from "@/components/learn/lesson-discussion";
import { classHref } from "@/lib/learn/classes";

/**
 * `notFound()` here as well as in the page, and deliberately so.
 *
 * `/learn` has a `loading.tsx`, so everything under it is a streamed
 * response — and Next 16 sends a streamed response's status line before the
 * body, which means a `notFound()` raised during rendering shows the
 * not-found screen under a 200 rather than a 404. That is the documented
 * trade-off for streaming, and `noindex` is the documented mitigation: Next
 * injects it, so a soft 404 stays out of search.
 *
 * Raising it here is the earliest point a missing lesson can be detected, so
 * this is where the `noindex, nofollow` comes from. The loader is memoised
 * for the request, so asking twice costs one query rather than two.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; lessonSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) return { title: "Lesson" };
  const { slug, lessonSlug } = await params;
  const page = await getLessonPage(slug, lessonSlug, session.user.id);
  if (!page) notFound();
  return { title: `${page.lesson.title} · ${page.course.title}` };
}

/**
 * One lesson.
 *
 * The syllabus on the left, the lesson on the right, and previous/next at the
 * bottom — the shape every course player converges on, for the reason that it
 * keeps "where am I" and "what now" both on screen without either taking the
 * page over.
 *
 * Nothing about the media is rendered here. The player asks for its own source
 * from an endpoint that re-checks entitlement on every request, so this page's
 * HTML never contains the address of a paid recording even for a member who is
 * entitled to it.
 *
 * A locked lesson still renders its title, its section and the syllabus around
 * it. Telling somebody what they are missing and why is more useful than a
 * 404, and it is also the only honest answer: the lesson exists.
 */
export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { slug, lessonSlug } = await params;
  const page = await getLessonPage(slug, lessonSlug, session.user.id);
  if (!page) notFound();

  const { course, lesson, gate, progress } = page;
  const bodyHtml = lesson.body ? renderMarkdown(lesson.body) : null;
  const plays = lesson.kind === "VIDEO" || lesson.kind === "AUDIO";
  const showPlayer =
    gate.state === "open" &&
    (plays || lesson.kind === "DOWNLOAD" || lesson.kind === "LIVE");

  return (
    <AppShell wide>
      <div className="mx-auto w-full max-w-[1160px] pb-6">
        <Link
          href={classHref(course.slug)}
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground-muted no-underline transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {course.title}
        </Link>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="lg:order-1">
            <LessonSyllabus
              sections={course.sections}
              currentLessonId={lesson.id}
              courseTitle={course.title}
              courseHref={classHref(course.slug)}
              completedCount={course.completedCount}
              lessonCount={course.lessonCount}
              percent={course.percent}
            />
          </div>

          <div className="min-w-0 space-y-4 lg:order-2">
            <header className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
                {lesson.sectionTitle} · Lesson {lesson.index} of{" "}
                {course.lessonCount}
              </p>
              <h1 className="font-display text-[1.45rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
                {lesson.title}
              </h1>
              {lesson.summary ? (
                <p className="text-[14px] leading-relaxed text-foreground-muted">
                  {lesson.summary}
                </p>
              ) : null}
            </header>

            {showPlayer ? (
              // Keyed on the lesson so moving to the next one mounts a fresh
              // player rather than reusing the last one's loaded source.
              <LessonPlayer
                key={lesson.id}
                lessonId={lesson.id}
                kind={lesson.kind}
                title={lesson.title}
                poster={course.photo}
                chapters={lesson.chapters}
                resumeAt={progress.positionSeconds}
                completed={progress.completed}
              />
            ) : null}

            {gate.state === "locked" ? (
              <div className="rounded-card border border-brand/25 bg-brand-wash px-4 py-5 text-center">
                <Lock className="mx-auto size-6 text-brand-strong" aria-hidden />
                <h2 className="mt-2 text-[15px] font-bold text-foreground">
                  {gate.membership === "expired"
                    ? "Your membership has run out"
                    : "This lesson is for members"}
                </h2>
                <p className="mx-auto mt-1 max-w-[44ch] text-[13.5px] text-foreground-muted">
                  {gate.membership === "expired"
                    ? "Renew and everything comes back exactly where you left it — this lesson included."
                    : "Members get every class in the library, and keep their place across devices."}
                </p>
                <Link
                  href={gate.membership === "expired" ? "/billing" : "/membership"}
                  className="mt-3.5 inline-flex h-10 items-center rounded-ctl bg-brand-fill px-5 text-[14px] font-semibold text-brand-fill-foreground no-underline transition hover:bg-brand-fill-hover"
                >
                  {gate.membership === "expired"
                    ? "Check your membership"
                    : "See membership"}
                </Link>
              </div>
            ) : null}

            {gate.state === "unavailable" ? (
              <p className="rounded-card border border-dashed border-border bg-surface px-4 py-6 text-center text-[13.5px] text-foreground-muted">
                {gate.reason === "draft"
                  ? "This lesson is still being written."
                  : "Nothing has been attached to this lesson yet. It will appear here the moment it is."}
              </p>
            ) : null}

            {gate.state === "open" && bodyHtml ? (
              <div
                className="prose-vu text-[15px] leading-relaxed text-foreground"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            ) : null}

            {gate.state === "open" && lesson.kind === "QUIZ" ? (
              <ReflectionForm lessonId={lesson.id} answer={page.response} />
            ) : null}

            {gate.state === "open" && !plays && lesson.kind !== "QUIZ" ? (
              <CompleteButton
                lessonId={lesson.id}
                completed={progress.completed}
              />
            ) : null}

            {gate.state === "open" && lesson.resources.length > 0 ? (
              <section className="space-y-2">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
                  For this lesson
                </h2>
                <ul className="space-y-1.5">
                  {lesson.resources
                    .filter((resource) => resource.kind !== "captions")
                    .map((resource) => (
                      <li key={resource.id}>
                        <a
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 rounded-card border border-border bg-surface px-3.5 py-2.5 text-[14px] text-foreground no-underline transition hover:border-hairline-firm"
                        >
                          <FileText
                            className="size-4 shrink-0 text-brand"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {resource.title}
                          </span>
                        </a>
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}

            <nav
              aria-label="Lessons"
              className="grid grid-cols-1 gap-2 border-t border-border pt-4 sm:grid-cols-2"
            >
              {page.previous ? (
                <Link
                  href={page.previous.href}
                  rel="prev"
                  className="group flex min-w-0 items-center gap-2 rounded-card border border-border bg-surface px-3.5 py-3 no-underline transition hover:border-hairline-firm"
                >
                  <ArrowLeft
                    className="size-4 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
                      Previous
                    </span>
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">
                      {page.previous.title}
                    </span>
                  </span>
                </Link>
              ) : (
                <span className="hidden sm:block" />
              )}

              {page.next ? (
                <Link
                  href={page.next.href}
                  rel="next"
                  className="group flex min-w-0 items-center justify-end gap-2 rounded-card border border-border bg-surface px-3.5 py-3 text-right no-underline transition hover:border-hairline-firm"
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
                      Next
                    </span>
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">
                      {page.next.title}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                </Link>
              ) : (
                <Link
                  href={classHref(course.slug)}
                  className="flex min-w-0 items-center justify-end gap-2 rounded-card border border-border bg-surface px-3.5 py-3 text-right no-underline transition hover:border-hairline-firm"
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
                      That was the last one
                    </span>
                    <span className="block truncate text-[13.5px] font-semibold text-foreground">
                      Back to {course.title}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                </Link>
              )}
            </nav>

            {gate.state === "open" ? (
              <LessonDiscussion
                lessonId={lesson.id}
                discussion={page.discussion}
                viewer={{
                  name: session.user.name ?? "You",
                  avatar: session.user.image ?? null,
                }}
                spaceHref={course.discussHref}
              />
            ) : course.discussHref ? (
              <Link
                href={course.discussHref}
                className="inline-flex h-9 items-center gap-2 rounded-ctl border border-border bg-surface px-3.5 text-[13.5px] font-semibold text-foreground no-underline transition hover:border-hairline-firm"
              >
                <MessageSquare className="size-4" aria-hidden />
                Ask about this class
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
