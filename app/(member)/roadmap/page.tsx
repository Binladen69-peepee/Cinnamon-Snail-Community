import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Circle,
  Flag,
  Lock,
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
  CADENCES,
  CADENCE_LABEL,
  loadRoadmapPage,
  roadmapErrorText,
  type Cadence,
  type MilestoneView,
  type RoadmapPage,
  type TrackSummary,
} from "@/lib/roadmap";
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
  Select,
  buttonClass,
  cardClass,
} from "@/components/app/ui";
import { PendingButton } from "@/components/ui/pending-button";
import {
  COOK_VIBES,
  PRIMARY_BENEFITS,
  SUCKIEST_THINGS,
  labelFor,
} from "@/lib/roadmap/answers";
import {
  completeMilestoneAction,
  leaveAction,
  restartAction,
  saveAnswersAction,
  setCadenceAction,
  setPausedAction,
  skipMilestoneAction,
  startTrackAction,
  swapRecipeAction,
} from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Roadmap" };

/** A section's own heading, where the section is labelled by its id. */
const SECTION_TITLE = "text-title font-semibold text-foreground";

/** A radio answer, as a chip. The checked one takes the brand edge and wash. */
const RADIO_CHIP =
  "inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface py-1 pl-2.5 pr-3 text-label font-medium text-foreground-muted transition hover:border-hairline-firm hover:text-foreground has-[:checked]:border-brand has-[:checked]:bg-brand-wash has-[:checked]:text-on-brand-wash";

/**
 * The personalised learning roadmap — BUILD.md §14.
 *
 * One track at a time, milestones unlocked in order, each ticked off by
 * marking its goal done once the work is shown. The rules live in
 * `lib/roadmap`; this page renders them and posts plain forms.
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
    answers?: string;
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

  const choosing = Boolean(data && (!data.active || params.switch === "1"));

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Roadmap"
          description="Your path through the kitchen, one milestone at a time, at your pace."
        />

        {error ||
        params.done === "answers" ||
        params.done === "skipped" ||
        params.done === "milestone" ||
        params.done === "track" ? (
          <div className="-mt-2 flex flex-col gap-3">
            {error ? (
              <Callout tone="danger" role="alert">
                {error}
              </Callout>
            ) : null}

            {params.done === "answers" ? (
              <Callout tone="brand" icon={<Sparkles />} role="status">
                Saved. Your roadmap is tuned to those answers.
              </Callout>
            ) : null}

            {params.done === "skipped" ? (
              <Callout tone="neutral" icon={<SkipForward />} role="status">
                Skipped. The next milestone is open — that one is not counted as
                done.
              </Callout>
            ) : null}

            {params.done === "milestone" || params.done === "track" ? (
              <Callout tone="success" icon={<PartyPopper />} role="status">
                {params.done === "track"
                  ? "Track complete. Every milestone, done."
                  : "Milestone done. The next one is open."}
              </Callout>
            ) : null}
          </div>
        ) : null}

        {!data ? (
          <ErrorState
            title="Your roadmap didn’t load"
            description="Something went wrong on our side. Reload the page in a moment."
            action={<ButtonLink href="/roadmap">Reload</ButtonLink>}
          />
        ) : (
          <>
            {/* §14 opens with the four answers, and everything below keys off
                them. When none is set the quiz leads; afterwards it folds away
                into something they can reopen. */}
            <AnswersPanel
              answers={data.answers}
              open={data.needsAnswers || params.answers === "1"}
            />

            {choosing ? (
              <TrackChooser
                data={data}
                staff={staff}
                switching={Boolean(data.active)}
              />
            ) : data.active ? (
              <ActiveRoadmap
                active={data.active}
                benefit={data.answers.primaryBenefit}
              />
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

/**
 * The four answers — §14 "Four member answers".
 *
 * Plain radios in a plain form, so it works before hydration and a member can
 * answer one thing and leave the rest blank. Nothing here is required: the
 * roadmap works without any of it, and each answer only adds a little.
 */
function AnswersPanel({
  answers,
  open,
}: {
  answers: RoadmapPage["answers"];
  open: boolean;
}) {
  const summary = [
    labelFor(COOK_VIBES, answers.cookVibe),
    labelFor(SUCKIEST_THINGS, answers.suckiestThing),
    labelFor(PRIMARY_BENEFITS, answers.primaryBenefit),
    answers.glutenFree === true ? "Gluten free" : null,
  ].filter(Boolean);

  return (
    <details
      open={open}
      className={cardClass({
        padding: "none",
        className: "group overflow-hidden",
      })}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition hover:bg-surface-muted sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span className="text-body font-semibold text-foreground">
            {summary.length === 0 ? "Tune your roadmap" : "Your answers"}
          </span>
          <span className="truncate text-label text-foreground-muted">
            {summary.length === 0
              ? "Four quick questions"
              : summary.join(" · ")}
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-foreground-muted transition group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <form
        action={saveAnswersAction}
        className="flex flex-col gap-5 border-t border-separator px-4 py-5 sm:px-5"
      >
        <Choice
          name="cookVibe"
          legend="How do you cook right now?"
          help="Picks the track we suggest."
          options={COOK_VIBES}
          value={answers.cookVibe}
        />
        <Choice
          name="suckiestThing"
          legend="What gets in the way?"
          help="Milestones can carry a line aimed at this."
          options={SUCKIEST_THINGS}
          value={answers.suckiestThing}
        />
        <Choice
          name="primaryBenefit"
          legend="What do you want from it?"
          help="Changes how a milestone is worded, not what it asks."
          options={PRIMARY_BENEFITS}
          value={answers.primaryBenefit}
        />

        <fieldset>
          <legend className="text-label font-semibold text-foreground">
            Do you eat gluten free?
          </legend>
          <p className="mt-0.5 text-caption text-foreground-muted">
            Swaps the recipe on a milestone when a gluten-free one is written.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {[
              ["yes", "Yes", true],
              ["no", "No", false],
            ].map(([value, label, on]) => (
              <label key={String(value)} className={RADIO_CHIP}>
                <input
                  type="radio"
                  name="glutenFree"
                  value={String(value)}
                  defaultChecked={answers.glutenFree === on}
                  className="size-3.5"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <PendingButton className={buttonClass({ variant: "primary" })}>
            Save answers
          </PendingButton>
        </div>
      </form>
    </details>
  );
}

function Choice({
  name,
  legend,
  help,
  options,
  value,
}: {
  name: string;
  legend: string;
  help: string;
  options: { value: string; label: string; help?: string }[];
  value: string | null;
}) {
  return (
    <fieldset>
      <legend className="text-label font-semibold text-foreground">
        {legend}
      </legend>
      <p className="mt-0.5 text-caption text-foreground-muted">{help}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} title={option.help} className={RADIO_CHIP}>
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={value === option.value}
              className="size-3.5"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

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
            ? "No roadmap track is published yet. Members will see the tracks here as soon as one is published with its milestones."
            : "Each roadmap is a short run of milestones: a topic, a lesson, a recipe and a goal. None is open yet. The course library is, in the meantime."
        }
        action={<ButtonLink href="/learn">Browse courses</ButtonLink>}
      />
    );
  }

  const { answers } = data;
  const tracks = [...data.tracks].sort(
    (a, b) => Number(b.recommended) - Number(a.recommended),
  );

  return (
    <section aria-labelledby="choose-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="choose-title" className={SECTION_TITLE}>
          {switching ? "Switch track" : "Choose a track"}
        </h2>
        {switching ? (
          <ButtonLink href="/roadmap" variant="ghost" size="sm">
            Keep my current track
          </ButtonLink>
        ) : null}
      </div>

      {switching ? (
        <Callout tone="warning">
          Switching starts the new track from its first milestone. Ticks on your
          current track are cleared.
        </Callout>
      ) : null}

      {answers.cookVibe || answers.suckiestThing || answers.primaryBenefit ? (
        <dl className="grid grid-cols-1 gap-3 rounded-card bg-surface-muted p-4 sm:grid-cols-3">
          {[
            ["How you cook", labelFor(COOK_VIBES, answers.cookVibe)],
            [
              "What gets in the way",
              labelFor(SUCKIEST_THINGS, answers.suckiestThing),
            ],
            [
              "What you want from it",
              labelFor(PRIMARY_BENEFITS, answers.primaryBenefit),
            ],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-caption font-medium text-foreground-muted">
                  {label}
                </dt>
                <dd className="mt-0.5 text-body text-foreground">{value}</dd>
              </div>
            ))}
        </dl>
      ) : null}

      <ul className="flex flex-col gap-3">
        {tracks.map((track) => (
          <li key={track.id}>
            <TrackCard track={track} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TrackCard({ track }: { track: TrackSummary }) {
  const empty = track.milestoneCount === 0;
  return (
    <Card
      as="div"
      className={cn(
        "flex flex-col gap-3",
        track.recommended && "border-hairline-firm",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-title font-semibold text-foreground">
            {track.name}
          </h3>
          <p className="mt-0.5 text-caption text-foreground-muted">
            {track.milestoneCount}{" "}
            {track.milestoneCount === 1 ? "milestone" : "milestones"}
          </p>
        </div>
        {track.recommended ? (
          <Badge tone="brand" icon={<Sparkles aria-hidden />}>
            Fits how you cook
          </Badge>
        ) : null}
      </div>
      {track.description ? (
        <p className="text-body text-foreground-muted">{track.description}</p>
      ) : null}
      {empty ? (
        <p className="text-label text-foreground-muted">
          Milestones are still being written.
        </p>
      ) : (
        <form
          action={startTrackAction}
          className="flex flex-wrap items-center gap-2 pt-1"
        >
          <input type="hidden" name="trackId" value={track.id} />
          <label className="sr-only" htmlFor={`cadence-${track.id}`}>
            How often
          </label>
          <Select
            id={`cadence-${track.id}`}
            name="cadence"
            defaultValue="weekly"
            className="w-auto"
          >
            {CADENCES.map((cadence) => (
              <option key={cadence} value={cadence}>
                {CADENCE_LABEL[cadence]}
              </option>
            ))}
          </Select>
          <PendingButton className={buttonClass({ variant: "primary" })}>
            <PlayCircle className="size-4" aria-hidden />
            Start this track
          </PendingButton>
        </form>
      )}
    </Card>
  );
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ActiveRoadmap({
  active,
  benefit,
}: {
  active: NonNullable<RoadmapPage["active"]>;
  benefit: string | null;
}) {
  const total = active.milestones.length;
  const percent =
    total === 0 ? 0 : Math.round((active.completed / total) * 100);
  const finished = total > 0 && active.completed === total;

  return (
    <div className="flex flex-col gap-8">
      <section
        aria-labelledby="track-title"
        className={cardClass({ padding: "none" })}
      >
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Overline>Your track</Overline>
              <h2
                id="track-title"
                className="mt-1 text-heading font-semibold text-foreground"
              >
                {active.track.name}
              </h2>
              {active.track.description ? (
                <p className="mt-1 text-body text-foreground-muted">
                  {active.track.description}
                </p>
              ) : null}
            </div>
            <ButtonLink href="/roadmap?switch=1" size="sm">
              Switch track
            </ButtonLink>
          </div>

          {benefit ? (
            <p className="flex items-start gap-2 text-body text-foreground">
              <Target
                className="mt-0.5 size-4 shrink-0 text-brand"
                aria-hidden
              />
              <span>
                Working towards:{" "}
                <span className="font-semibold">
                  {labelFor(PRIMARY_BENEFITS, benefit) ?? benefit}
                </span>
              </span>
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-label">
              <span className="font-medium text-foreground">
                {active.completed} of {total} milestones
              </span>
              <span className="tabular-nums text-foreground-muted">
                {percent}%
              </span>
            </div>
            <ProgressBar
              value={active.completed}
              max={total}
              label="Milestones completed"
              tone={finished ? "success" : "brand"}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-separator px-4 py-3 sm:px-5">
          <form action={setCadenceAction} className="flex items-center gap-2">
            <label
              htmlFor="cadence"
              className="text-label font-medium text-foreground-muted"
            >
              Pace
            </label>
            <Select
              id="cadence"
              name="cadence"
              defaultValue={active.cadence}
              size="sm"
              className="w-auto"
            >
              {CADENCES.map((cadence) => (
                <option key={cadence} value={cadence}>
                  {CADENCE_LABEL[cadence as Cadence]}
                </option>
              ))}
            </Select>
            <PendingButton className={buttonClass({ size: "sm" })}>
              Save
            </PendingButton>
          </form>
          <form action={setPausedAction}>
            <input
              type="hidden"
              name="paused"
              value={active.pausedAt ? "false" : "true"}
            />
            <PendingButton
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              {active.pausedAt ? (
                <PlayCircle className="size-4" aria-hidden />
              ) : (
                <PauseCircle className="size-4" aria-hidden />
              )}
              {active.pausedAt ? "Resume" : "Pause"}
            </PendingButton>
          </form>
          <div className="flex items-center gap-2 sm:ml-auto">
            <form action={restartAction}>
              <PendingButton
                className={buttonClass({ variant: "danger", size: "sm" })}
              >
                <RotateCcw className="size-4" aria-hidden />
                Restart track
              </PendingButton>
            </form>
            <form action={leaveAction}>
              <PendingButton
                className={buttonClass({ variant: "danger", size: "sm" })}
              >
                Leave roadmap
              </PendingButton>
            </form>
          </div>
        </div>
      </section>

      {active.pausedAt ? (
        <Callout tone="neutral" icon={<PauseCircle />} className="-mt-4">
          Paused since {formatDate(active.pausedAt)}. Nothing falls due while
          you are paused.
        </Callout>
      ) : null}

      {finished ? (
        <EmptyState
          icon={<Flag />}
          title="You finished this track"
          description="Every milestone is done. Start another track, or restart this one to cook through it again."
          action={
            <ButtonLink href="/roadmap?switch=1" variant="primary">
              Choose another track
            </ButtonLink>
          }
        />
      ) : null}

      <section
        aria-labelledby="milestones-title"
        className="flex flex-col gap-3"
      >
        <h2 id="milestones-title" className={SECTION_TITLE}>
          Milestones
        </h2>
        <Card as="div" padding="none" className="overflow-hidden">
          <ol className="divide-y divide-separator">
            {active.milestones.map((milestone, index) => (
              <li
                key={milestone.id}
                id={milestone.state === "current" ? "current" : undefined}
                className="scroll-mt-20"
              >
                <Milestone
                  milestone={milestone}
                  number={index + 1}
                  paused={Boolean(active.pausedAt)}
                  recipeChoices={active.recipeChoices}
                />
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </div>
  );
}

function Milestone({
  milestone,
  number,
  paused,
  recipeChoices,
}: {
  milestone: MilestoneView;
  number: number;
  paused: boolean;
  recipeChoices: { id: string; title: string }[];
}) {
  const { state } = milestone;
  // A skip gets its own mark. It is not a tick, and it must never look like one.
  const StateIcon =
    state === "done"
      ? CheckCircle2
      : state === "skipped"
        ? SkipForward
        : state === "current"
          ? Circle
          : Lock;

  if (state !== "current") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <StateIcon
          className={cn(
            "size-5 shrink-0",
            state === "done" ? "text-success" : "text-foreground-muted",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-body font-medium",
              state === "upcoming"
                ? "text-foreground-muted"
                : "text-foreground",
            )}
          >
            <span className="tabular-nums text-foreground-muted">
              {number}.
            </span>{" "}
            {milestone.topic}
          </p>
          <p className="text-caption text-foreground-muted">
            {state === "done" && milestone.completedAt
              ? `Done ${formatDate(milestone.completedAt)}`
              : state === "skipped" && milestone.skippedAt
                ? `Skipped ${formatDate(milestone.skippedAt)} · not counted as done`
                : milestone.dueAt
                  ? `Opens in order · due ${formatDate(milestone.dueAt)}`
                  : "Opens when the one before it is done"}
          </p>
        </div>
        {state === "done" ? (
          <Badge tone="success">Completed</Badge>
        ) : (
          <span className="sr-only">
            {state === "skipped" ? "Skipped" : "Locked"}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative bg-brand-wash/40 px-4 py-5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand sm:px-5">
      <div className="flex items-start gap-3">
        <Circle className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-caption font-medium text-brand-strong">
            Now · milestone {number}
            {milestone.dueAt ? ` · due ${formatDate(milestone.dueAt)}` : ""}
          </p>
          <h3 className="mt-0.5 text-title font-semibold text-foreground">
            {milestone.topic}
          </h3>

          {/* "Primary Benefit = Framing" and "Suckiest Thing = Constraint" (§14).
              Both are optional and only appear when the author wrote something for
              this member's answer. */}
          {milestone.framing ? (
            <p className="mt-2 text-body text-foreground">
              {milestone.framing}
            </p>
          ) : null}
          {milestone.constraintNote ? (
            <p className="mt-1.5 text-label text-foreground-muted">
              {milestone.constraintNote}
            </p>
          ) : null}

          <ul className="mt-4 flex flex-col gap-3 text-body">
            {milestone.lesson ? (
              <Slot icon={BookOpen} label="Lesson">
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
            {milestone.recipe ? (
              <Slot icon={ChefHat} label="Recipe">
                <span className="font-semibold text-foreground">
                  {milestone.swappedRecipe
                    ? milestone.swappedRecipe.title
                    : milestone.recipe.title}
                </span>
                {milestone.swappedRecipe ? (
                  <span className="ml-1.5 text-caption text-foreground-muted">
                    · swapped for {milestone.recipe.title}
                  </span>
                ) : milestone.recipe.glutenFree ? (
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
                <span className="text-foreground">
                  {milestone.communityAction}
                </span>
              </Slot>
            ) : null}
          </ul>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-separator pt-4">
            {paused ? (
              <p className="text-label text-foreground-muted">
                Resume your roadmap to tick this off.
              </p>
            ) : (
              <>
                <form action={completeMilestoneAction}>
                  <input
                    type="hidden"
                    name="milestoneId"
                    value={milestone.id}
                  />
                  <PendingButton
                    className={buttonClass({ variant: "primary" })}
                  >
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
                  <input
                    type="hidden"
                    name="milestoneId"
                    value={milestone.id}
                  />
                  <PendingButton className={buttonClass({ variant: "ghost" })}>
                    <SkipForward className="size-4" aria-hidden />
                    Skip this one
                  </PendingButton>
                </form>

                {!milestone.evidenceMet ? (
                  <p className="basis-full text-caption text-foreground-muted">
                    {milestone.lesson
                      ? "To tick this off, watch most of the lesson or post what you cooked."
                      : "To tick this off, post what you cooked."}{" "}
                    Skipping moves you on without counting it as done.
                  </p>
                ) : null}

                {/* Recipe swap — §14 "Support". Folded away because most members
                    will cook the recipe they were given; the ones who cannot are
                    the reason it exists. */}
                {milestone.recipe && recipeChoices.length > 0 ? (
                  <details className="group/swap basis-full pt-1">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-label font-medium text-foreground-muted transition hover:text-foreground [&::-webkit-details-marker]:hidden">
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
                      <input
                        type="hidden"
                        name="milestoneId"
                        value={milestone.id}
                      />
                      <label
                        htmlFor={`swap-${milestone.id}`}
                        className="sr-only"
                      >
                        Recipe to cook instead
                      </label>
                      <Select
                        id={`swap-${milestone.id}`}
                        name="recipeId"
                        defaultValue={milestone.swappedRecipe?.id ?? ""}
                        className="w-auto max-w-full"
                      >
                        <option value="">
                          {milestone.recipe.title} (as written)
                        </option>
                        {recipeChoices
                          .filter(
                            (choice) => choice.id !== milestone.recipe?.id,
                          )
                          .map((choice) => (
                            <option key={choice.id} value={choice.id}>
                              {choice.title}
                            </option>
                          ))}
                      </Select>
                      <PendingButton className={buttonClass()}>
                        Save
                      </PendingButton>
                      <p className="basis-full text-caption text-foreground-muted">
                        The goal and the lesson stay the same — this just
                        records what you actually made.
                      </p>
                    </form>
                  </details>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
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
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-foreground-muted shadow-e1">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <span className="block text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
          {label}
        </span>
        {children}
      </div>
    </li>
  );
}
