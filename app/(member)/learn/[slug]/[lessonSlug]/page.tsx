import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  FileClock,
  Lock,
  MessageSquare,
  PenLine,
} from "lucide-react";
import { auth } from "@/auth";
import { getLessonPage } from "@/lib/learn/lesson";
import { renderMarkdown } from "@/lib/markdown";
import { AppShell } from "@/components/app/app-shell";
import {
  ButtonLink,
  Card,
  EmptyState,
  PageHeader,
  Section,
  cardClass,
} from "@/components/app/ui";
import { LessonPlayer } from "@/components/learn/lesson-player";
import { LessonSyllabus } from "@/components/learn/lesson-syllabus";
import {
  CompleteButton,
  ReflectionForm,
} from "@/components/learn/lesson-actions-bar";
import { LessonDiscussion } from "@/components/learn/lesson-discussion";
import { ResourceList } from "@/components/learn/resource-list";
import { classHref } from "@/lib/learn/classes";
import { cn } from "@/lib/utils";

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

/** The previous/next cards at the foot of a lesson. */
const STEP_CARD = cardClass({
  padding: "none",
  interactive: true,
  className: "flex min-w-0 items-center gap-3 px-4 py-3 no-underline",
});

/**
 * One lesson.
 *
 * The lesson in the main column — the player first, then its title, what to do
 * with it and the conversation about it — with the syllabus beside it from
 * `lg` up and previous/next at the bottom: the shape every course player
 * converges on, for the reason that it keeps "where am I" and "what now" both
 * on screen without either taking the page over. On a phone the syllabus is a
 * folded bar above the player.
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
  const resources = lesson.resources.filter(
    (resource) => resource.kind !== "captions",
  );

  return (
    <AppShell size="wide">
      <div className="flex flex-col gap-4">
        <Link
          href={classHref(course.slug)}
          className="-ml-1 inline-flex w-fit max-w-full items-center gap-1 rounded-ctl px-1 text-label font-medium text-foreground-muted no-underline transition hover:text-foreground"
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{course.title}</span>
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
          <div className="lg:order-2">
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

          <div className="flex min-w-0 flex-col gap-6 lg:order-1">
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
              <Card as="div" padding="none">
                <EmptyState
                  bordered={false}
                  icon={<Lock />}
                  title={
                    gate.membership === "expired"
                      ? "Your membership has run out"
                      : "This lesson is for members"
                  }
                  description={
                    gate.membership === "expired"
                      ? "Renew and everything comes back exactly where you left it — this lesson included."
                      : "Members get every class in the library, and keep their place across devices."
                  }
                  action={
                    <ButtonLink
                      href={
                        gate.membership === "expired"
                          ? "/billing"
                          : "/membership"
                      }
                      variant="primary"
                      size="lg"
                    >
                      {gate.membership === "expired"
                        ? "Check your membership"
                        : "See membership"}
                    </ButtonLink>
                  }
                />
              </Card>
            ) : null}

            {gate.state === "unavailable" ? (
              gate.reason === "draft" ? (
                <EmptyState
                  icon={<PenLine />}
                  title="This lesson is still being written."
                />
              ) : (
                <EmptyState
                  icon={<FileClock />}
                  title="Nothing has been attached to this lesson yet."
                  description="It will appear here the moment it is."
                />
              )
            ) : null}

            <PageHeader
              eyebrow={
                <>
                  {lesson.sectionTitle} · Lesson {lesson.index} of{" "}
                  {course.lessonCount}
                </>
              }
              title={lesson.title}
              description={lesson.summary || undefined}
            />

            {gate.state === "open" && bodyHtml ? (
              <div
                className="prose-vu text-reading text-foreground"
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

            {/* Counted after the captions are taken out, so a lesson whose
                only file is its subtitles shows no empty heading. */}
            {gate.state === "open" && resources.length > 0 ? (
              <Section title="For this lesson">
                <ResourceList resources={resources} />
              </Section>
            ) : null}

            <nav
              aria-label="Lessons"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {page.previous ? (
                <Link
                  href={page.previous.href}
                  rel="prev"
                  className={STEP_CARD}
                >
                  <ArrowLeft
                    className="size-4 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-caption font-medium text-foreground-muted">
                      Previous
                    </span>
                    <span className="block truncate text-body font-semibold text-foreground">
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
                  className={cn(STEP_CARD, "justify-end text-right")}
                >
                  <span className="min-w-0">
                    <span className="block text-caption font-medium text-foreground-muted">
                      Next
                    </span>
                    <span className="block truncate text-body font-semibold text-foreground">
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
                  className={cn(STEP_CARD, "justify-end text-right")}
                >
                  <span className="min-w-0">
                    <span className="block text-caption font-medium text-foreground-muted">
                      That was the last one
                    </span>
                    <span className="block truncate text-body font-semibold text-foreground">
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
              <div>
                <ButtonLink href={course.discussHref}>
                  <MessageSquare className="size-4" aria-hidden />
                  Ask about this class
                </ButtonLink>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
