import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Flag,
  Map as MapIcon,
  PartyPopper,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  SkipForward,
  Sparkles,
  Target,
  Users,
  WheatOff,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { getUserAuth } from "@/lib/community/viewer";
import { isStaff } from "@/lib/permissions";
import {
  loadRoadmapPage,
  roadmapErrorText,
  type ActiveRoadmap,
  type MilestoneView,
  type RoadmapPage,
  type TrackSummary,
} from "@/lib/roadmap";
import { DEFAULT_WEEKS_PER_TOPIC, weeksLabel } from "@/lib/roadmap/pacing";
import { AppShell } from "@/components/app/app-shell";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  ErrorState,
  Overline,
  PageHeader,
  ProgressBar,
  Section,
  Select,
  buttonClass,
  cardClass,
} from "@/components/app/ui";
import { PendingButton } from "@/components/ui/pending-button";
import { PaceSegments } from "@/components/roadmap/pace-control";
import { WeekMeter } from "@/components/roadmap/week-meter";
import {
  completeMilestoneAction,
  leaveAction,
  restartAction,
  setPaceAction,
  setPausedAction,
  skipMilestoneAction,
  startTrackAction,
  swapRecipeAction,
} from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Roadmap" };

/** What the header says when there is no roadmap to talk about yet. */
const NEUTRAL_DESCRIPTION = "Your path through the kitchen: one topic at a time, at your pace.";

/** A summary row that opens a `<details>`, without the browser's marker. */
const SUMMARY_ROW =
  "flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition hover:bg-surface-muted sm:px-5 [&::-webkit-details-marker]:hidden";

type Dates = { day: (date: Date) => string };

/**
 * Dates in the member's own time zone when they set one, with the year only
 * when it is not this one.
 */
function dateFormat(timezone: string | null, now: Date): Dates {
  const make = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone ?? undefined });
    } catch {
      // An unknown zone in the profile must not take the page down.
      return new Intl.DateTimeFormat("en-US", options);
    }
  };
  const short = make({ month: "short", day: "numeric" });
  const long = make({ month: "short", day: "numeric", year: "numeric" });
  const year = make({ year: "numeric" });
  const thisYear = year.format(now);
  return {
    day: (date) => (year.format(date) === thisYear ? short : long).format(date),
  };
}

/**
 * The personalised learning roadmap — BUILD.md §14, paced per DEC-080.
 *
 * One sentence says what the roadmap was built from (the answers the member
 * already gave at onboarding; there is no questionnaire here any more), then
 * the pace, then the one topic being worked on now, what comes next, and what
 * is done. The rules live in `lib/roadmap`; this page renders them and posts
 * plain forms, so it works before hydration.
 *
 * Tracks are authored content. Until one is published the page says so
 * plainly rather than inventing a plan.
 */
export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    done?: string;
    switch?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/roadmap");

  const params = await searchParams;
  const error = roadmapErrorText(params.error);

  let data: RoadmapPage | null = null;
  try {
    data = await loadRoadmapPage(session.user.id);
  } catch (cause) {
    console.error("[roadmap] load failed", cause);
  }
  const viewer = await getUserAuth(session.user.id).catch(() => null);
  const staff = viewer ? isStaff(viewer) : false;

  const dates = dateFormat(data?.timezone ?? null, new Date());
  const switching = Boolean(data?.active && params.switch === "1");
  const choosing = Boolean(data && (!data.active || switching));
  // The sentence says a roadmap has been put together, so it only leads when
  // there is one to follow or to start.
  const sentence =
    data && (data.active || data.tracks.length > 0) ? data.personalisation.sentence : null;

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Roadmap"
          description={
            sentence ? <span className="text-foreground">{sentence}</span> : NEUTRAL_DESCRIPTION
          }
        />

        <TopNotices error={error} done={params.done} />

        {!data ? (
          <ErrorState
            title="Your roadmap didn’t load"
            description="Something went wrong on our side. Reload the page in a moment."
            action={<ButtonLink href="/roadmap">Reload</ButtonLink>}
          />
        ) : choosing ? (
          <TrackChooser data={data} staff={staff} switching={switching} />
        ) : data.active ? (
          <ActiveRoadmapView active={data.active} done={params.done} dates={dates} />
        ) : null}
      </div>
    </AppShell>
  );
}

/**
 * Notices that belong at the top. The ones about the current topic sit with
 * it (the page scrolls there), and the pace one sits with the pace control.
 */
function TopNotices({ error, done }: { error: string | null; done?: string }) {
  if (!error && done !== "started" && done !== "track") return null;
  return (
    <div className="-mt-2 flex flex-col gap-3">
      {error ? (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      ) : null}
      {done === "started" ? (
        <Callout tone="success" icon={<PlayCircle />} role="status">
          You’re on your way. Your first topic is below.
        </Callout>
      ) : null}
      {done === "track" ? (
        <Callout tone="success" icon={<PartyPopper />} role="status">
          You reached the end of the track.
        </Callout>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Choosing a track                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Starting (or switching) is one click, with no questions first: the answers
 * the member gave at onboarding already point at a track, which leads as
 * "Suggested for you". Nothing is started for them — enrolling sends their
 * track to Kit, so it waits for the member to choose.
 */
function TrackChooser({
  data,
  staff,
  switching,
}: {
  data: RoadmapPage;
  staff: boolean;
  switching: boolean;
}) {
  if (data.tracks.length === 0) {
    return (
      <EmptyState
        icon={<MapIcon />}
        title="Roadmaps are on their way"
        description={
          staff
            ? "No roadmap track is published yet. Members will see the tracks here as soon as one is published with its topics."
            : "Each roadmap is a short run of topics, one at a time: a class, a recipe and a goal. None is open yet. The class library is, in the meantime."
        }
        action={<ButtonLink href="/learn">Browse classes</ButtonLink>}
      />
    );
  }

  const current = data.active;
  const others = data.tracks.filter((track) => track.id !== current?.track.id);
  const suggested = switching
    ? undefined
    : others.find((track) => track.recommended && track.milestoneCount > 0);
  const rest = others.filter((track) => track.id !== suggested?.id);
  const pace = current?.weeksPerTopic ?? DEFAULT_WEEKS_PER_TOPIC;

  return (
    <div className="flex flex-col gap-8">
      {switching && current ? (
        <Callout
          tone="warning"
          title={`Switching leaves ${current.track.name}`}
          action={
            <ButtonLink href="/roadmap" variant="ghost" size="sm">
              Keep my track
            </ButtonLink>
          }
        >
          The new track starts from its first topic, and your progress on this one
          is cleared. Your pace stays at {weeksLabel(pace)} per topic.
        </Callout>
      ) : null}

      {suggested ? (
        <section
          aria-labelledby="suggested-title"
          className={cardClass({ className: "flex flex-col gap-4" })}
        >
          <div className="min-w-0">
            <Badge tone="brand" icon={<Sparkles aria-hidden />}>
              Suggested for you
            </Badge>
            <h2
              id="suggested-title"
              className="mt-2.5 text-heading font-semibold text-foreground"
            >
              {suggested.name}
            </h2>
            {suggested.description ? (
              <p className="mt-1 text-body text-foreground-muted">{suggested.description}</p>
            ) : null}
            <p className="mt-2 text-label text-foreground-muted">
              {topicCount(suggested.milestoneCount)}, one at a time. You start at{" "}
              {weeksLabel(pace)} per topic and can change the pace whenever you like.
            </p>
          </div>
          <form action={startTrackAction}>
            <input type="hidden" name="trackId" value={suggested.id} />
            <PendingButton className={buttonClass({ variant: "primary" })}>
              <PlayCircle className="size-4" aria-hidden />
              Start my roadmap
            </PendingButton>
          </form>
        </section>
      ) : null}

      {rest.length > 0 ? (
        <Section
          title={switching || suggested ? "Other tracks" : "Choose a track"}
          description={
            switching || suggested
              ? undefined
              : `One topic at a time, starting at ${weeksLabel(pace)} per topic. Change the pace whenever you like.`
          }
        >
          <Card as="div" padding="none" className="overflow-hidden">
            <ul className="divide-y divide-separator">
              {rest.map((track) => (
                <li key={track.id}>
                  <TrackRow track={track} switching={switching} />
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : switching ? (
        <EmptyState
          size="sm"
          icon={<MapIcon />}
          title="No other track to switch to"
          description="Yours is the only published track for now."
          action={<ButtonLink href="/roadmap">Back to my roadmap</ButtonLink>}
        />
      ) : null}
    </div>
  );
}

function topicCount(count: number) {
  return `${count} ${count === 1 ? "topic" : "topics"}`;
}

function TrackRow({ track, switching }: { track: TrackSummary; switching: boolean }) {
  const empty = track.milestoneCount === 0;
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-body font-semibold text-foreground">{track.name}</span>
          {track.recommended ? (
            <Badge tone="brand" icon={<Sparkles aria-hidden />}>
              Suggested for you
            </Badge>
          ) : null}
        </p>
        {track.description ? (
          <p className="mt-0.5 text-label text-foreground-muted">{track.description}</p>
        ) : null}
        <p className="mt-1 text-caption text-foreground-muted">
          {empty ? "Topics are still being written." : topicCount(track.milestoneCount)}
        </p>
      </div>
      {empty ? null : (
        <form action={startTrackAction} className="shrink-0">
          <input type="hidden" name="trackId" value={track.id} />
          <PendingButton className={buttonClass({ size: "sm" })}>
            <PlayCircle className="size-4" aria-hidden />
            {switching ? "Switch to this track" : "Start this track"}
          </PendingButton>
        </form>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The roadmap                                                                */
/* -------------------------------------------------------------------------- */

function ActiveRoadmapView({
  active,
  done,
  dates,
}: {
  active: ActiveRoadmap;
  done?: string;
  dates: Dates;
}) {
  const numbered = active.milestones.map((milestone, index) => ({
    milestone,
    number: index + 1,
  }));
  const now = active.current ? active.milestones[active.current.index] : undefined;
  const upcoming = numbered.filter(({ milestone }) => milestone.state === "upcoming");
  const settled = numbered.filter(
    ({ milestone }) => milestone.state === "done" || milestone.state === "skipped",
  );

  return (
    <div className="flex flex-col gap-8">
      {active.current ? (
        <PaceSection active={active} saved={done === "pace"} dates={dates} />
      ) : null}

      <div id="current" className="flex scroll-mt-20 flex-col gap-3">
        <TopicNotice done={done} active={active} />

        {active.pausedAt ? (
          <Callout
            tone="neutral"
            icon={<PauseCircle />}
            action={
              <form action={setPausedAction}>
                <input type="hidden" name="paused" value="false" />
                <PendingButton className={buttonClass({ size: "sm" })}>
                  <PlayCircle className="size-4" aria-hidden />
                  Resume
                </PendingButton>
              </form>
            }
          >
            Paused since {dates.day(active.pausedAt)}. Your week count is on hold, and
            nothing moves on until you resume.
          </Callout>
        ) : null}

        {now && active.current ? (
          <NowCard
            milestone={now}
            number={active.current.index + 1}
            total={active.milestones.length}
            active={active}
            dates={dates}
          />
        ) : (
          <EmptyState
            icon={<Flag />}
            title="You finished this track"
            description="Every topic is settled. Choose another track, or start this one again from the options below."
            action={
              <ButtonLink href="/roadmap?switch=1" variant="primary">
                Choose another track
              </ButtonLink>
            }
          />
        )}
      </div>

      {upcoming.length > 0 ? (
        <UpNext upcoming={upcoming} active={active} dates={dates} />
      ) : null}

      {settled.length > 0 ? <Completed settled={settled} dates={dates} /> : null}

      <TrackPanel active={active} />
    </div>
  );
}

function TopicNotice({ done, active }: { done?: string; active: ActiveRoadmap }) {
  if (done === "milestone") {
    return (
      <Callout tone="success" icon={<PartyPopper />} role="status">
        Topic done. The next one is open, and its first week starts today.
      </Callout>
    );
  }
  if (done === "skipped") {
    return (
      <Callout tone="neutral" icon={<SkipForward />} role="status">
        Skipped. The next topic is open — that one is not counted as done.
      </Callout>
    );
  }
  if (done === "resumed" && active.current) {
    return (
      <Callout tone="brand" icon={<PlayCircle />} role="status">
        Welcome back. You’re picking up in week {active.current.schedule.week} of{" "}
        {active.current.schedule.weeks}.
      </Callout>
    );
  }
  if (done === "restarted") {
    return (
      <Callout tone="neutral" icon={<RotateCcw />} role="status">
        Starting fresh from the first topic, at the same pace.
      </Callout>
    );
  }
  return null;
}

/**
 * The pace control (DEC-080): the client's wording, then four segments. A tap
 * saves; nothing else on the roadmap changes.
 */
function PaceSection({
  active,
  saved,
  dates,
}: {
  active: ActiveRoadmap;
  saved: boolean;
  dates: Dates;
}) {
  return (
    <section
      id="pace"
      aria-labelledby="pace-title"
      className={cardClass({ className: "flex scroll-mt-20 flex-col gap-4" })}
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="pace-title" className="text-title font-semibold text-foreground">
          Your pace
        </h2>
        <p id="pace-help" className="text-body text-foreground-muted text-pretty">
          We’ll work with you on topics one at a time, but you control the pacing.
          Outside of the monthly live class, how much time do you want on each
          topic? Think working with tofu, making Malaysian recipes, or mastering the
          art of vegan meats.
        </p>
      </div>

      <form action={setPaceAction} className="flex flex-col gap-2">
        <PaceSegments
          value={active.weeksPerTopic}
          label="Time on each topic"
          describedBy="pace-help"
        />
        <p className="text-caption text-foreground-muted">
          Per topic. Changing it never resets your progress.
        </p>
      </form>

      {saved ? (
        <p
          role="status"
          className="flex items-start gap-1.5 text-label font-medium text-foreground"
        >
          <CheckCircle2 className="mt-px size-4 shrink-0 text-success" aria-hidden />
          Saved: {weeksLabel(active.weeksPerTopic)} per topic. You’re still right
          where you were.
        </p>
      ) : null}

      {active.finishesAt ? (
        <p className="text-label text-foreground-muted">
          At this pace you’ll wrap up{" "}
          <span className="font-medium text-foreground">{active.track.name}</span>{" "}
          around{" "}
          <span className="font-medium text-foreground">{dates.day(active.finishesAt)}</span>.
        </p>
      ) : null}
    </section>
  );
}

/** The one topic being worked on now: week X of N, the class, the recipe, the goal. */
function NowCard({
  milestone,
  number,
  total,
  active,
  dates,
}: {
  milestone: MilestoneView;
  number: number;
  total: number;
  active: ActiveRoadmap;
  dates: Dates;
}) {
  const schedule = active.current!.schedule;
  const paused = Boolean(active.pausedAt);
  const recipeChoices = active.recipeChoices;
  const shownRecipe = milestone.swappedRecipe ?? milestone.recipe;

  return (
    <section
      aria-labelledby="now-title"
      className={cardClass({ padding: "none", className: "overflow-hidden" })}
    >
      <div className="flex flex-col gap-5 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-micro font-semibold uppercase tracking-[0.08em] text-brand-strong">
            Now · Topic {number} of {total}
          </p>
          <h2
            id="now-title"
            className="mt-1 text-heading font-semibold text-foreground text-balance"
          >
            <span className="sr-only">Now: </span>
            {milestone.topic}
          </h2>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="text-label font-semibold text-foreground">
              {paused ? "Paused in week" : "Week"} {schedule.week} of {schedule.weeks}
            </p>
            <p className="text-caption text-foreground-muted">
              {paused
                ? "On hold while you’re paused"
                : schedule.overdue
                  ? `Past your ${weeksLabel(schedule.weeks)} plan. Move on whenever you’re ready.`
                  : `Wraps up around ${dates.day(schedule.endsAt)}`}
            </p>
          </div>
          <WeekMeter week={schedule.week} weeks={schedule.weeks} />
        </div>

        {/* "Primary Benefit = Framing" and "Suckiest Thing = Constraint" (§14).
            Both are optional and only appear when the author wrote something for
            this member's answer. */}
        {milestone.framing || milestone.constraintNote ? (
          <div className="flex flex-col gap-1.5">
            {milestone.framing ? (
              <p className="text-reading text-foreground">{milestone.framing}</p>
            ) : null}
            {milestone.constraintNote ? (
              <p className="text-label text-foreground-muted">{milestone.constraintNote}</p>
            ) : null}
          </div>
        ) : null}

        <ul className="flex flex-col gap-3 text-body">
          {milestone.lesson ? (
            <Slot icon={BookOpen} label="Class">
              {milestone.lesson.courseTitle &&
              milestone.lesson.courseTitle !== milestone.lesson.title ? (
                <span className="block text-caption text-foreground-muted">
                  {milestone.lesson.courseTitle}
                </span>
              ) : null}
              <Link
                href={milestone.lesson.href}
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                {milestone.lesson.title}
              </Link>
              {milestone.lesson.watched ? (
                <span className="ml-1.5 text-caption font-medium text-foreground-muted">
                  · watched
                </span>
              ) : null}
            </Slot>
          ) : null}
          {shownRecipe ? (
            <Slot icon={ChefHat} label="Recipe">
              {shownRecipe.href ? (
                <Link
                  href={shownRecipe.href}
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {shownRecipe.title}
                </Link>
              ) : (
                <span className="font-semibold text-foreground">{shownRecipe.title}</span>
              )}
              {milestone.swappedRecipe && milestone.recipe ? (
                <span className="ml-1.5 text-caption text-foreground-muted">
                  · swapped for {milestone.recipe.title}
                </span>
              ) : milestone.recipe?.glutenFree ? (
                <span className="ml-1.5 inline-flex items-center gap-1 text-caption font-medium text-foreground-muted">
                  <WheatOff className="size-3.5" aria-hidden />
                  gluten free
                </span>
              ) : null}
            </Slot>
          ) : null}
          <Slot icon={Target} label="Goal">
            <span className="text-foreground">{milestone.learningGoal}</span>
          </Slot>
          {milestone.communityAction ? (
            <Slot icon={Users} label="With the community">
              <span className="text-foreground">{milestone.communityAction}</span>
            </Slot>
          ) : null}
        </ul>
      </div>

      <div className="border-t border-separator px-4 py-4 sm:px-5">
        {paused ? (
          <p className="text-label text-foreground-muted">
            Resume your roadmap to tick this topic off.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <form action={completeMilestoneAction}>
                <input type="hidden" name="milestoneId" value={milestone.id} />
                <PendingButton className={buttonClass({ variant: "primary" })}>
                  <CheckCircle2 className="size-4" aria-hidden />
                  Mark goal done
                </PendingButton>
              </form>
              {!milestone.evidenceMet ? (
                <ButtonLink href="/compose?type=RECIPE">
                  <ChefHat className="size-4" aria-hidden />
                  Post what you cooked
                </ButtonLink>
              ) : null}
              {/* Skip — §14 "Support". No evidence needed, which is the point:
                  a member who cannot do this one should not be stuck behind it. */}
              <form action={skipMilestoneAction}>
                <input type="hidden" name="milestoneId" value={milestone.id} />
                <PendingButton className={buttonClass({ variant: "ghost" })}>
                  <SkipForward className="size-4" aria-hidden />
                  Skip this topic
                </PendingButton>
              </form>
            </div>

            <p className="text-caption text-foreground-muted">
              {milestone.evidenceMet
                ? null
                : milestone.lesson
                  ? "To tick this off, watch most of the class or post what you cooked. "
                  : "To tick this off, post what you cooked. "}
              Skipping moves you on without counting it as done.
            </p>

            {/* Recipe swap — §14 "Support". Folded away because most members
                will cook the recipe they were given; the ones who cannot are
                the reason it exists. */}
            {milestone.recipe && recipeChoices.length > 0 ? (
              <details className="group/swap">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-ctl text-label font-medium text-foreground-muted transition hover:text-foreground [&::-webkit-details-marker]:hidden">
                  Cook something else instead
                  <ChevronDown
                    className="size-4 transition group-open/swap:rotate-180"
                    aria-hidden
                  />
                </summary>
                <form
                  action={swapRecipeAction}
                  className="mt-2.5 flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="milestoneId" value={milestone.id} />
                  <label htmlFor={`swap-${milestone.id}`} className="sr-only">
                    Recipe to cook instead
                  </label>
                  <Select
                    id={`swap-${milestone.id}`}
                    name="recipeId"
                    defaultValue={milestone.swappedRecipe?.id ?? ""}
                    className="w-auto max-w-full"
                  >
                    <option value="">{milestone.recipe.title} (as written)</option>
                    {recipeChoices
                      .filter((choice) => choice.id !== milestone.recipe?.id)
                      .map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.title}
                        </option>
                      ))}
                  </Select>
                  <PendingButton className={buttonClass()}>Save</PendingButton>
                  <p className="basis-full text-caption text-foreground-muted">
                    The goal and the class stay the same — this just records what you
                    actually made.
                  </p>
                </form>
              </details>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function Slot({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 pt-px">
        <span className="block text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
          {label}
        </span>
        {children}
      </div>
    </li>
  );
}

type Numbered = { milestone: MilestoneView; number: number };

/** What comes after the current topic, in order, with when each is planned to start. */
function UpNext({
  upcoming,
  active,
  dates,
}: {
  upcoming: Numbered[];
  active: ActiveRoadmap;
  dates: Dates;
}) {
  const overdue = Boolean(active.current?.schedule.overdue);
  return (
    <Section
      title="Up next"
      count={upcoming.length}
      description={
        active.pausedAt
          ? "Dates come back when you resume."
          : `One topic every ${weeksLabel(active.weeksPerTopic)}, at your pace.`
      }
    >
      <Card as="div" padding="none" className="overflow-hidden">
        <ol className="divide-y divide-separator">
          {upcoming.map(({ milestone, number }, order) => (
            <li key={milestone.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-default text-caption font-semibold tabular-nums text-foreground-muted">
                {number}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-body",
                      order === 0 ? "font-semibold text-foreground" : "font-medium text-foreground",
                    )}
                  >
                    {milestone.topic}
                  </span>
                  {order === 0 ? <Badge tone="brand">Next</Badge> : null}
                </p>
                {order === 0 && milestone.lesson ? (
                  <p className="truncate text-caption text-foreground-muted">
                    Class: {milestone.lesson.title}
                  </p>
                ) : null}
              </div>
              {milestone.plannedStartAt ? (
                <span className="shrink-0 text-caption tabular-nums text-foreground-muted">
                  {order === 0 && overdue
                    ? "When you move on"
                    : `From ${dates.day(milestone.plannedStartAt)}`}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>
    </Section>
  );
}

/** Settled topics, folded away: done ones and skipped ones, never confused. */
function Completed({ settled, dates }: { settled: Numbered[]; dates: Dates }) {
  const done = settled.filter(({ milestone }) => milestone.state === "done").length;
  const skipped = settled.length - done;
  return (
    <details className={cardClass({ padding: "none", className: "group overflow-hidden" })}>
      <summary className={SUMMARY_ROW}>
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-foreground">Completed</span>
          <span className="block text-caption text-foreground-muted">
            {topicCount(done)} done
            {skipped > 0 ? ` · ${skipped} skipped` : ""}
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-foreground-muted transition group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <ol className="divide-y divide-separator border-t border-separator">
        {settled.map(({ milestone, number }) => {
          // A skip gets its own mark. It is not a tick, and it must never look like one.
          const isDone = milestone.state === "done";
          const Icon = isDone ? CheckCircle2 : SkipForward;
          return (
            <li key={milestone.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Icon
                className={cn(
                  "size-5 shrink-0",
                  isDone ? "text-success" : "text-foreground-muted",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-foreground">
                  <span className="tabular-nums text-foreground-muted">{number}.</span>{" "}
                  {milestone.topic}
                </p>
                <p className="text-caption text-foreground-muted">
                  {isDone
                    ? milestone.completedAt
                      ? `Done ${dates.day(milestone.completedAt)}`
                      : "Done"
                    : milestone.skippedAt
                      ? `Skipped ${dates.day(milestone.skippedAt)} · not counted as done`
                      : "Skipped · not counted as done"}
                </p>
              </div>
              {isDone ? (
                <Badge tone="success">Completed</Badge>
              ) : (
                <span className="sr-only">Skipped</span>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

/** The track itself: progress, switching, pausing — and, folded, starting over or leaving. */
function TrackPanel({ active }: { active: ActiveRoadmap }) {
  const total = active.milestones.length;
  const percent = total === 0 ? 0 : Math.round((active.completed / total) * 100);
  const finished = active.current === null;

  return (
    <section aria-labelledby="track-title" className={cardClass({ padding: "none" })}>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Overline>Your track</Overline>
            <h2 id="track-title" className="mt-1 text-title font-semibold text-foreground">
              {active.track.name}
            </h2>
            {active.track.description ? (
              <p className="mt-1 text-body text-foreground-muted">{active.track.description}</p>
            ) : null}
          </div>
          <ButtonLink href="/roadmap?switch=1" size="sm">
            Switch track
          </ButtonLink>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 text-label">
            <span className="font-medium text-foreground">
              {active.completed} of {total} topics done
              {active.skipped > 0 ? (
                <span className="font-normal text-foreground-muted">
                  {" "}
                  · {active.skipped} skipped
                </span>
              ) : null}
            </span>
            <span className="tabular-nums text-foreground-muted">{percent}%</span>
          </div>
          <ProgressBar
            value={active.completed}
            max={total}
            label="Topics completed"
            tone={finished ? "success" : "brand"}
          />
        </div>

        {!finished && !active.pausedAt ? (
          <form action={setPausedAction}>
            <input type="hidden" name="paused" value="true" />
            <PendingButton className={buttonClass({ variant: "ghost", size: "sm" })}>
              <PauseCircle className="size-4" aria-hidden />
              Pause my roadmap
            </PendingButton>
          </form>
        ) : null}
      </div>

      {/* Both of these throw work away, so they sit one click further in. */}
      <details className="group/more border-t border-separator">
        <summary className={cn(SUMMARY_ROW, "py-3 text-label font-medium text-foreground-muted hover:text-foreground")}>
          <span className="flex-1">Start over or leave</span>
          <ChevronDown
            className="size-4 shrink-0 transition group-open/more:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="flex flex-col divide-y divide-separator border-t border-separator">
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-label text-foreground-muted">
              Restarting clears your progress on this track and begins again from the
              first topic, at the same pace.
            </p>
            <form action={restartAction} className="shrink-0">
              <PendingButton className={buttonClass({ variant: "danger", size: "sm" })}>
                <RotateCcw className="size-4" aria-hidden />
                Restart track
              </PendingButton>
            </form>
          </div>
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-label text-foreground-muted">
              Leaving removes your roadmap and its progress. You can start a track
              again whenever you like.
            </p>
            <form action={leaveAction} className="shrink-0">
              <PendingButton className={buttonClass({ variant: "danger", size: "sm" })}>
                Leave roadmap
              </PendingButton>
            </form>
          </div>
        </div>
      </details>
    </section>
  );
}
