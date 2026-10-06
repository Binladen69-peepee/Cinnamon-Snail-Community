import { Fragment } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChefHat, Clock, ListVideo, Lock, PlayCircle } from "lucide-react";
import { auth } from "@/auth";
import { getClassDetail, relatedShelf } from "@/lib/learn/library";
import { categoryHref } from "@/lib/learn/classes";
import { tileMeta } from "@/lib/learn/shelves";
import { AppShell } from "@/components/app/app-shell";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  PageHeader,
  ProgressBar,
  Section,
} from "@/components/app/ui";
import { ClassPlayer } from "@/components/learn/class-player";
import { ClassShelf } from "@/components/learn/class-shelf";
import { ClassTile } from "@/components/learn/class-tile";
import { ResourceList } from "@/components/learn/resource-list";
import { StepMark } from "@/components/learn/step-mark";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user.id) return { title: "Class" };
  const detail = await getClassDetail(slug, session.user.id);
  // Raised here as well as in the page: this segment streams, so a
  // `notFound()` from the page body renders the right screen under a 200.
  // See the lesson page for the longer note.
  if (!detail) notFound();
  return { title: detail.title };
}

/**
 * One class.
 *
 * The destination search results, the marketing class library's
 * `classDetailHref` and every library shelf point at.
 *
 * The classes were imported without lessons, so the page is built around what
 * is real first — the still, the teaser, and what the class is — and the
 * syllabus appears underneath as soon as a curriculum exists. Every lesson row
 * is a link to the lesson unless this member cannot open it, in which case it
 * is a padlock and says why. Playback is gated on a live membership; the
 * teaser is not, because it is marketing.
 *
 * The header carries what the member came to do: where they are in the class
 * and the one button that continues it, with every shelf the class sits on
 * above the title. The syllabus is a single card of rows, one strip per
 * section, rather than a card per section. The page ends on the rest of the
 * class's first shelf: a library suggests the next book, it does not open a
 * discussion room (DEC-078).
 */
export default async function ClassPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { slug } = await params;
  const cls = await getClassDetail(slug, session.user.id);
  if (!cls) notFound();

  const home = cls.categories[0] ?? null;
  const related = home
    ? await relatedShelf({
        courseId: cls.id,
        categorySlug: home.slug,
        userId: session.user.id,
      })
    : null;

  const hasMeta = Boolean(cls.instructor || cls.length || cls.lessonCount > 0);

  return (
    <AppShell size="page">
      <div className="flex flex-col gap-8">
        <PageHeader
          back={{ href: "/learn", label: "All classes" }}
          eyebrow={
            cls.categories.length > 0 ? (
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {cls.categories.map((category, index) => (
                  <Fragment key={category.slug}>
                    {index > 0 ? (
                      <span aria-hidden className="text-foreground-muted">
                        ·
                      </span>
                    ) : null}
                    <Link
                      href={categoryHref(category.slug)}
                      className="text-brand-strong no-underline hover:underline"
                    >
                      {category.name}
                    </Link>
                  </Fragment>
                ))}
              </span>
            ) : undefined
          }
          title={cls.title}
          description={cls.description || undefined}
          actions={
            cls.lessonCount > 0 && cls.resume ? (
              <ButtonLink
                href={cls.resume.href}
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
              >
                <PlayCircle className="size-4" aria-hidden />
                {cls.resume.started ? "Continue" : "Start the class"}
              </ButtonLink>
            ) : undefined
          }
        >
          {hasMeta ? (
            <div className="flex flex-col gap-4">
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-foreground-muted">
                {cls.instructor ? (
                  <span className="inline-flex items-center gap-1.5">
                    <ChefHat className="size-3.5" aria-hidden />
                    {cls.instructor}
                  </span>
                ) : null}
                {cls.length ? (
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Clock className="size-3.5" aria-hidden />
                    {cls.length} teaser
                  </span>
                ) : null}
                {cls.lessonCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <PlayCircle className="size-3.5" aria-hidden />
                    {cls.lessonCount}{" "}
                    {cls.lessonCount === 1 ? "lesson" : "lessons"}
                  </span>
                ) : null}
              </p>

              {cls.lessonCount > 0 ? (
                <div className="flex max-w-md flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2 text-label">
                    <span className="font-medium text-foreground">
                      Your progress
                    </span>
                    <span className="tabular-nums text-foreground-muted">
                      {cls.completedCount} of {cls.lessonCount} · {cls.percent}%
                    </span>
                  </div>
                  <ProgressBar
                    value={cls.percent}
                    label={`${cls.title} progress`}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </PageHeader>

        <div className="flex flex-col gap-4">
          <ClassPlayer
            photo={cls.photo}
            teaserEmbed={cls.teaserEmbed}
            title={cls.title}
          />

          {!cls.entitled ? (
            <Callout tone="brand" icon={<Lock />}>
              Your membership is not active, so the full class will not play.
              The teaser above is free to watch.{" "}
              <Link
                href="/billing"
                className="font-semibold text-link underline"
              >
                Check your membership
              </Link>
            </Callout>
          ) : null}
        </div>

        <Section title="In this class">
          {cls.sections.length > 0 ? (
            <Card as="div" padding="none" className="overflow-hidden">
              {cls.sections.map((section, sectionIndex) => (
                <div
                  key={section.id}
                  className={cn(
                    sectionIndex > 0 && "border-t border-separator",
                  )}
                >
                  <h3 className="border-b border-separator bg-surface-muted/60 px-4 py-2.5 text-label font-semibold text-foreground sm:px-5">
                    {section.title}
                  </h3>
                  <ul className="divide-y divide-separator">
                    {section.lessons.map((lesson) => {
                      const body = (
                        <>
                          <StepMark
                            state={
                              lesson.completed
                                ? "done"
                                : lesson.playable
                                  ? "open"
                                  : "locked"
                            }
                          >
                            <PlayCircle />
                          </StepMark>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body font-medium text-foreground">
                              {lesson.title}
                            </span>
                            {lesson.summary ? (
                              <span className="block truncate text-caption text-foreground-muted">
                                {lesson.summary}
                              </span>
                            ) : null}
                          </span>
                          {lesson.isPreview && !lesson.playable ? (
                            <Badge tone="outline">Free</Badge>
                          ) : null}
                          {lesson.durationMin ? (
                            <span className="shrink-0 text-caption tabular-nums text-foreground-muted">
                              {lesson.durationMin} min
                            </span>
                          ) : null}
                        </>
                      );

                      return (
                        <li key={lesson.id}>
                          {lesson.playable ? (
                            <Link
                              href={lesson.href}
                              className="flex items-center gap-3 px-4 py-3 no-underline transition hover:bg-surface-muted sm:px-5"
                            >
                              {body}
                            </Link>
                          ) : (
                            // Listed but not a link: a member should be able to
                            // see what the class contains before they can open
                            // it, and a row that silently does nothing when
                            // tapped is worse than one that looks locked.
                            <span
                              aria-disabled="true"
                              title={
                                lesson.gate.state === "locked"
                                  ? "Members only"
                                  : "Not ready yet"
                              }
                              className="flex items-center gap-3 px-4 py-3 opacity-60 sm:px-5"
                            >
                              {body}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </Card>
          ) : (
            <EmptyState
              size="sm"
              icon={<ListVideo />}
              title="The full cook-along is on its way"
              description="The full cook-along for this class is not on the platform yet. The teaser above is the real thing — the rest follows as Adam moves his catalog across."
            />
          )}
        </Section>

        {cls.resources.length > 0 ? (
          <Section title="Recipes and downloads">
            <ResourceList resources={cls.resources} />
          </Section>
        ) : null}

        {related ? (
          <ClassShelf
            title={`More in ${related.category.name}`}
            seeAllHref={categoryHref(related.category.slug)}
          >
            {related.classes.map((item) => (
              <ClassTile
                key={item.id}
                cls={item}
                percent={item.percent}
                meta={tileMeta(item.categories, related.category.slug)}
              />
            ))}
          </ClassShelf>
        ) : null}
      </div>
    </AppShell>
  );
}
