import { cache } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Flag } from "lucide-react";
import { loadRoadmapFocus, type RoadmapFocus } from "@/lib/roadmap";
import { ButtonLink, Card, CardHeader } from "@/components/app/ui";
import { WeekMeter } from "@/components/roadmap/week-meter";

/**
 * The member's current roadmap topic, for the Kitchen Table rail (DEC-080).
 *
 * CONTRACT (C5): `<RoadmapFocusCard userId={id} />`, an async server
 * component. Renders nothing when the member has no roadmap, and nothing when
 * it cannot load — the rail must never fail because of it.
 *
 * What it features is the roadmap's own idea of "now": the first topic not
 * completed or skipped, with week X of N at the member's pace and the class to
 * open. A finished track says so and points at the next one.
 */
/**
 * Once per request: the Kitchen Table renders the card twice (in the feed
 * below xl, in the rail from xl), and only one of them is ever on screen.
 */
const loadFocusOnce = cache(loadRoadmapFocus);

export async function RoadmapFocusCard({ userId }: { userId: string }) {
  let focus: RoadmapFocus | null = null;
  try {
    focus = await loadFocusOnce(userId);
  } catch (error) {
    console.error("[roadmap] focus card failed", error);
    return null;
  }
  if (!focus) return null;

  const { topic } = focus;

  return (
    <Card padding="none" className="overflow-hidden">
      <CardHeader
        title="Your roadmap"
        action={
          <Link
            href="/roadmap"
            className="rounded-chip text-caption font-medium text-link no-underline hover:underline"
          >
            Open
          </Link>
        }
      />

      {topic ? (
        <div className="flex flex-col gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-micro font-semibold uppercase tracking-[0.08em] text-brand-strong">
              {focus.paused ? "Paused" : "Now"} · Week {topic.schedule.week} of{" "}
              {topic.schedule.weeks}
            </p>
            <p className="mt-1 text-body font-semibold leading-snug">
              <Link
                href="/roadmap#current"
                className="text-foreground no-underline underline-offset-2 hover:underline"
              >
                <span className="sr-only">Now: </span>
                {topic.title}
              </Link>
            </p>
            <p className="mt-0.5 truncate text-caption text-foreground-muted">
              Topic {topic.number} of {topic.total} · {focus.track.name}
            </p>
          </div>

          <WeekMeter week={topic.schedule.week} weeks={topic.schedule.weeks} />
          {topic.schedule.overdue && !focus.paused ? (
            <p className="-mt-1 text-caption text-foreground-muted">
              Past your plan. Move on whenever you’re ready.
            </p>
          ) : null}

          {topic.lesson ? (
            <Link
              href={topic.lesson.href}
              className="-mx-2 flex items-center gap-2.5 rounded-ctl px-2 py-1.5 no-underline transition hover:bg-surface-muted"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash">
                <BookOpen className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                  Class
                </span>
                <span className="block truncate text-label font-semibold text-foreground">
                  {topic.lesson.title}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-foreground-muted" aria-hidden />
            </Link>
          ) : null}

          {topic.next ? (
            <p className="truncate text-caption text-foreground-muted">
              Next: <span className="font-medium text-foreground">{topic.next}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 px-4 py-3.5">
          <p className="flex items-start gap-2 text-label text-foreground">
            <Flag className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>
              You finished <span className="font-semibold">{focus.track.name}</span>.
            </span>
          </p>
          <ButtonLink href="/roadmap?switch=1" size="sm">
            Choose your next track
          </ButtonLink>
        </div>
      )}
    </Card>
  );
}
