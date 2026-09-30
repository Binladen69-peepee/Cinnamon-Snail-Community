import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  ChefHat,
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

const primaryBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-ctl bg-brand-fill px-3.5 text-[13.5px] font-semibold text-brand-fill-foreground no-underline transition hover:opacity-90";
const quietBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-ctl border border-border bg-background px-3.5 text-[13.5px] font-semibold text-foreground no-underline transition hover:border-hairline-firm";
const linkBtn =
  "inline-flex items-center gap-1 text-[12.5px] font-semibold text-foreground-muted underline-offset-2 hover:text-foreground hover:underline";
const selectCls =
  "h-9 rounded-ctl border border-border bg-background px-2.5 text-[13.5px] text-foreground";

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
      <div className="space-y-6 pb-4">
        <header>
          <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            Roadmap
          </h1>
          <p className="mt-1 text-[14px] text-foreground-muted">
            Your path through the kitchen, one milestone at a time, at your pace.
          </p>
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded-ctl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[13.5px] font-semibold text-danger"
          >
            {error}
          </p>
        ) : null}

        {params.done === "answers" ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-ctl border border-hairline-firm bg-brand-wash px-3.5 py-2.5 text-[13.5px] font-semibold text-on-brand-wash"
          >
            <Sparkles className="size-4 shrink-0" aria-hidden />
            Saved. Your roadmap is tuned to those answers.
          </p>
        ) : null}

        {params.done === "skipped" ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-ctl border border-border bg-surface px-3.5 py-2.5 text-[13.5px] text-foreground"
          >
            <SkipForward className="size-4 shrink-0 text-foreground-muted" aria-hidden />
            Skipped. The next milestone is open — that one is not counted as done.
          </p>
        ) : null}

        {params.done === "milestone" || params.done === "track" ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-ctl border border-hairline-firm bg-brand-wash px-3.5 py-2.5 text-[13.5px] font-semibold text-on-brand-wash"
          >
            <PartyPopper className="size-4 shrink-0" aria-hidden />
            {params.done === "track"
              ? "Track complete. Every milestone, done."
              : "Milestone done. The next one is open."}
          </p>
        ) : null}

        {!data ? (
          <Blank
            icon={MapIcon}
            tone="danger"
            title="Your roadmap didn’t load"
            body="Something went wrong on our side. Reload the page in a moment."
            action={{ href: "/roadmap", label: "Reload" }}
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
              <TrackChooser data={data} staff={staff} switching={Boolean(data.active)} />
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
      className="rounded-card border border-border bg-surface"
    >
      <summary className="cursor-pointer list-none px-4 py-3">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13.5px] font-bold text-foreground">
            {summary.length === 0 ? "Tune your roadmap" : "Your answers"}
          </span>
          <span className="text-[12.5px] text-foreground-muted">
            {summary.length === 0 ? "Four quick questions" : summary.join(" · ")}
          </span>
        </span>
      </summary>

      <form action={saveAnswersAction} className="space-y-4 border-t border-border px-4 py-4">
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
          <legend className="text-[13px] font-semibold text-foreground">
            Do you eat gluten free?
          </legend>
          <p className="mt-0.5 text-[12px] text-foreground-muted">
            Swaps the recipe on a milestone when a gluten-free one is written.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              ["yes", "Yes", true],
              ["no", "No", false],
            ].map(([value, label, on]) => (
              <label
                key={String(value)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-ctl border border-border bg-background px-3 py-1.5 text-[13px] text-foreground has-[:checked]:border-hairline-firm has-[:checked]:bg-brand-wash has-[:checked]:text-on-brand-wash"
              >
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

        <PendingButton className={primaryBtn}>Save answers</PendingButton>
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
      <legend className="text-[13px] font-semibold text-foreground">{legend}</legend>
      <p className="mt-0.5 text-[12px] text-foreground-muted">{help}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            title={option.help}
            className="inline-flex cursor-pointer items-center gap-2 rounded-ctl border border-border bg-background px-3 py-1.5 text-[13px] text-foreground has-[:checked]:border-hairline-firm has-[:checked]:bg-brand-wash has-[:checked]:text-on-brand-wash"
          >
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
      <Blank
        icon={MapIcon}
        title="Roadmaps are on their way"
        body={
          staff
            ? "No roadmap track is published yet. Members will see the tracks here as soon as one is published with its milestones."
            : "Each roadmap is a short run of milestones: a topic, a lesson, a recipe and a goal. None is open yet. The course library is, in the meantime."
        }
        action={{ href: "/learn", label: "Browse courses" }}
      />
    );
  }

  const { answers } = data;
  const tracks = [...data.tracks].sort((a, b) => Number(b.recommended) - Number(a.recommended));

  return (
    <section aria-labelledby="choose-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="choose-title"
          className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted"
        >
          {switching ? "Switch track" : "Choose a track"}
        </h2>
        {switching ? (
          <Link href="/roadmap" className={linkBtn}>
            Keep my current track
          </Link>
        ) : null}
      </div>

      {switching ? (
        <p className="text-[13px] text-foreground-muted">
          Switching starts the new track from its first milestone. Ticks on your current track are
          cleared.
        </p>
      ) : null}

      {answers.cookVibe || answers.suckiestThing || answers.primaryBenefit ? (
        <dl className="grid grid-cols-1 gap-2 rounded-card border border-border bg-surface p-3.5 text-[13px] sm:grid-cols-3">
          {[
            ["How you cook", labelFor(COOK_VIBES, answers.cookVibe)],
            ["What gets in the way", labelFor(SUCKIEST_THINGS, answers.suckiestThing)],
            ["What you want from it", labelFor(PRIMARY_BENEFITS, answers.primaryBenefit)],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
                  {label}
                </dt>
                <dd className="mt-0.5 text-foreground">{value}</dd>
              </div>
            ))}
        </dl>
      ) : null}

      <ul className="space-y-2">
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
    <div
      className={cn(
        "rounded-card border bg-surface p-4",
        track.recommended ? "border-hairline-firm" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-foreground">{track.name}</p>
          <p className="text-[12.5px] text-foreground-muted">
            {track.milestoneCount} {track.milestoneCount === 1 ? "milestone" : "milestones"}
          </p>
        </div>
        {track.recommended ? (
          <span className="rounded-full bg-brand-wash px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-on-brand-wash">
            Fits how you cook
          </span>
        ) : null}
      </div>
      {track.description ? (
        <p className="mt-2 text-[13.5px] text-foreground-muted">{track.description}</p>
      ) : null}
      {empty ? (
        <p className="mt-3 text-[13px] text-foreground-muted">Milestones are still being written.</p>
      ) : (
        <form action={startTrackAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="trackId" value={track.id} />
          <label className="sr-only" htmlFor={`cadence-${track.id}`}>
            How often
          </label>
          <select
            id={`cadence-${track.id}`}
            name="cadence"
            defaultValue="weekly"
            className={selectCls}
          >
            {CADENCES.map((cadence) => (
              <option key={cadence} value={cadence}>
                {CADENCE_LABEL[cadence]}
              </option>
            ))}
          </select>
          <PendingButton className={primaryBtn}>
            <PlayCircle className="size-4" aria-hidden />
            Start this track
          </PendingButton>
        </form>
      )}
    </div>
  );
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ActiveRoadmap({
  active,
  benefit,
}: {
  active: NonNullable<RoadmapPage["active"]>;
  benefit: string | null;
}) {
  const total = active.milestones.length;
  const percent = total === 0 ? 0 : Math.round((active.completed / total) * 100);
  const finished = total > 0 && active.completed === total;

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="track-title"
        className="rounded-card border border-border bg-surface p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              Your track
            </p>
            <h2 id="track-title" className="mt-0.5 font-display text-[1.2rem] font-bold text-foreground">
              {active.track.name}
            </h2>
            {active.track.description ? (
              <p className="mt-1 text-[13.5px] text-foreground-muted">{active.track.description}</p>
            ) : null}
          </div>
          <Link href="/roadmap?switch=1" className={quietBtn}>
            Switch track
          </Link>
        </div>

        {benefit ? (
          <p className="mt-3 flex items-start gap-1.5 text-[13.5px] text-foreground">
            <Target className="mt-0.5 size-4 shrink-0 text-foreground-muted" aria-hidden />
            <span>
              Working towards:{" "}
              <span className="font-semibold">
                {labelFor(PRIMARY_BENEFITS, benefit) ?? benefit}
              </span>
            </span>
          </p>
        ) : null}

        <div className="mt-4">
          <div className="flex items-baseline justify-between text-[12.5px] font-semibold text-foreground-muted">
            <span>
              {active.completed} of {total} milestones
            </span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={active.completed}
            aria-label="Milestones completed"
          >
            <div className="h-full rounded-full bg-brand-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
          <form action={setCadenceAction} className="flex items-center gap-2">
            <label htmlFor="cadence" className="text-[12.5px] font-semibold text-foreground-muted">
              Pace
            </label>
            <select id="cadence" name="cadence" defaultValue={active.cadence} className={selectCls}>
              {CADENCES.map((cadence) => (
                <option key={cadence} value={cadence}>
                  {CADENCE_LABEL[cadence as Cadence]}
                </option>
              ))}
            </select>
            <PendingButton className={linkBtn}>Save</PendingButton>
          </form>
          <form action={setPausedAction}>
            <input type="hidden" name="paused" value={active.pausedAt ? "false" : "true"} />
            <PendingButton className={linkBtn}>
              {active.pausedAt ? <PlayCircle className="size-3.5" aria-hidden /> : <PauseCircle className="size-3.5" aria-hidden />}
              {active.pausedAt ? "Resume" : "Pause"}
            </PendingButton>
          </form>
          <form action={restartAction}>
            <PendingButton className={linkBtn}>
              <RotateCcw className="size-3.5" aria-hidden />
              Restart track
            </PendingButton>
          </form>
          <form action={leaveAction} className="ml-auto">
            <PendingButton className={linkBtn}>Leave roadmap</PendingButton>
          </form>
        </div>
      </section>

      {active.pausedAt ? (
        <p className="flex items-center gap-2 rounded-ctl border border-border bg-surface px-3.5 py-2.5 text-[13.5px] text-foreground">
          <PauseCircle className="size-4 shrink-0 text-foreground-muted" aria-hidden />
          Paused since {formatDate(active.pausedAt)}. Nothing falls due while you are paused.
        </p>
      ) : null}

      {finished ? (
        <Blank
          icon={Flag}
          title="You finished this track"
          body="Every milestone is done. Start another track, or restart this one to cook through it again."
          action={{ href: "/roadmap?switch=1", label: "Choose another track" }}
        />
      ) : null}

      <section aria-labelledby="milestones-title" className="space-y-2.5">
        <h2
          id="milestones-title"
          className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted"
        >
          Milestones
        </h2>
        <ol className="space-y-2">
          {active.milestones.map((milestone, index) => (
            <li key={milestone.id} id={milestone.state === "current" ? "current" : undefined} className="scroll-mt-20">
              <Milestone
                milestone={milestone}
                number={index + 1}
                paused={Boolean(active.pausedAt)}
                recipeChoices={active.recipeChoices}
              />
            </li>
          ))}
        </ol>
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
      <div
        className={cn(
          "flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3",
          state === "upcoming" && "opacity-70",
        )}
      >
        <StateIcon
          className={cn("size-5 shrink-0", state === "done" ? "text-brand" : "text-foreground-muted")}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-foreground">
            <span className="text-foreground-muted">{number}.</span> {milestone.topic}
          </p>
          <p className="text-[12px] text-foreground-muted">
            {state === "done" && milestone.completedAt
              ? `Done ${formatDate(milestone.completedAt)}`
              : state === "skipped" && milestone.skippedAt
                ? `Skipped ${formatDate(milestone.skippedAt)} · not counted as done`
                : milestone.dueAt
                  ? `Opens in order · due ${formatDate(milestone.dueAt)}`
                  : "Opens when the one before it is done"}
          </p>
        </div>
        <span className="sr-only">
          {state === "done" ? "Completed" : state === "skipped" ? "Skipped" : "Locked"}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-hairline-firm bg-surface p-4">
      <div className="flex items-start gap-3">
        <Circle className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
            Now · milestone {number}
            {milestone.dueAt ? ` · due ${formatDate(milestone.dueAt)}` : ""}
          </p>
          <h3 className="mt-0.5 text-[16px] font-bold text-foreground">{milestone.topic}</h3>
        </div>
      </div>

      {/* "Primary Benefit = Framing" and "Suckiest Thing = Constraint" (§14).
          Both are optional and only appear when the author wrote something for
          this member's answer. */}
      {milestone.framing ? (
        <p className="mt-2.5 text-[13.5px] leading-snug text-foreground">{milestone.framing}</p>
      ) : null}
      {milestone.constraintNote ? (
        <p className="mt-1.5 text-[13px] leading-snug text-foreground-muted">
          {milestone.constraintNote}
        </p>
      ) : null}

      <ul className="mt-3 space-y-2 text-[13.5px]">
        {milestone.lesson ? (
          <Slot icon={BookOpen} label="Lesson">
            <Link href={milestone.lesson.href} className="font-semibold text-foreground underline-offset-2 hover:underline">
              {milestone.lesson.title}
            </Link>
            {milestone.lesson.watched ? (
              <span className="ml-1.5 text-[12px] font-semibold text-foreground-muted">· watched</span>
            ) : null}
          </Slot>
        ) : null}
        {milestone.recipe ? (
          <Slot icon={ChefHat} label="Recipe">
            <span className="font-semibold text-foreground">
              {milestone.swappedRecipe ? milestone.swappedRecipe.title : milestone.recipe.title}
            </span>
            {milestone.swappedRecipe ? (
              <span className="ml-1.5 text-[12px] text-foreground-muted">
                · swapped for {milestone.recipe.title}
              </span>
            ) : milestone.recipe.glutenFree ? (
              <span className="ml-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-foreground-muted">
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

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {paused ? (
          <p className="text-[13px] text-foreground-muted">Resume your roadmap to tick this off.</p>
        ) : (
          <>
            <form action={completeMilestoneAction}>
              <input type="hidden" name="milestoneId" value={milestone.id} />
              <PendingButton className={primaryBtn}>
                <CheckCircle2 className="size-4" aria-hidden />
                Mark goal done
              </PendingButton>
            </form>
            {!milestone.evidenceMet ? (
              <Link href="/compose?type=RECIPE" className={quietBtn}>
                <ChefHat className="size-4" aria-hidden />
                Post what you cooked
              </Link>
            ) : null}

            {/* Skip — §14 "Support". No evidence needed, which is the point:
                a member who cannot do this one should not be stuck behind it. */}
            <form action={skipMilestoneAction}>
              <input type="hidden" name="milestoneId" value={milestone.id} />
              <PendingButton className={quietBtn}>
                <SkipForward className="size-4" aria-hidden />
                Skip this one
              </PendingButton>
            </form>

            {!milestone.evidenceMet ? (
              <p className="basis-full text-[12.5px] text-foreground-muted">
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
              <details className="basis-full">
                <summary className="cursor-pointer text-[12.5px] font-semibold text-foreground-muted hover:text-foreground">
                  Cook something else instead
                </summary>
                <form
                  action={swapRecipeAction}
                  className="mt-2 flex flex-wrap items-center gap-2"
                >
                  <input type="hidden" name="milestoneId" value={milestone.id} />
                  <label htmlFor={`swap-${milestone.id}`} className="sr-only">
                    Recipe to cook instead
                  </label>
                  <select
                    id={`swap-${milestone.id}`}
                    name="recipeId"
                    defaultValue={milestone.swappedRecipe?.id ?? ""}
                    className={selectCls}
                  >
                    <option value="">{milestone.recipe.title} (as written)</option>
                    {recipeChoices
                      .filter((choice) => choice.id !== milestone.recipe?.id)
                      .map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.title}
                        </option>
                      ))}
                  </select>
                  <PendingButton className={quietBtn}>Save</PendingButton>
                  <p className="basis-full text-[12px] text-foreground-muted">
                    The goal and the lesson stay the same — this just records what
                    you actually made.
                  </p>
                </form>
              </details>
            ) : null}
          </>
        )}
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
      <Icon className="mt-0.5 size-4 shrink-0 text-foreground-muted" aria-hidden />
      <div className="min-w-0">
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
          {label}
        </span>
        {children}
      </div>
    </li>
  );
}

function Blank({
  icon: Icon,
  title,
  body,
  action,
  tone = "neutral",
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { href: string; label: string };
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className="rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center"
    >
      <span
        className={cn(
          "mx-auto grid size-12 place-items-center rounded-full",
          tone === "danger" ? "bg-danger/10 text-danger" : "bg-brand-wash text-on-brand-wash",
        )}
      >
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="mt-3 font-display text-[1.15rem] font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-[48ch] text-[14px] text-foreground-muted">{body}</p>
      {action ? (
        <Link href={action.href} className={cn(quietBtn, "mt-4")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
