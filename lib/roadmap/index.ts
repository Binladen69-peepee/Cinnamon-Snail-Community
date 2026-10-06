import "server-only";
import { prisma } from "@/lib/db";
import { getUserAuth } from "@/lib/community/viewer";
import { canEnterSpace } from "@/lib/permissions";
import {
  COOK_VIBES,
  PRIMARY_BENEFITS,
  SUCKIEST_THINGS,
  keyedText,
  normalizeAnswer,
  normalizeGlutenFree,
} from "@/lib/roadmap/answers";
import {
  resolvePersonalisation,
  trackMatchesPersona,
  type Personalisation,
} from "@/lib/roadmap/personalisation";
import {
  DEFAULT_WEEKS_PER_TOPIC,
  WEEKS_PER_TOPIC_OPTIONS,
  currentTopic,
  effectiveWeeksPerTopic,
  plannedFinish,
  resumedTopicStart,
  topicSchedule,
  upcomingTopicStarts,
  type TopicSchedule,
  type WeeksPerTopic,
} from "@/lib/roadmap/pacing";
import { parseWeeksPerTopic } from "@/lib/roadmap/pace-input";
import { awardBadgesAfterResponse } from "@/lib/social/badge-triggers";

/**
 * The personalised learning roadmap — BUILD.md §14, paced per DEC-080.
 *
 * A member follows one track at a time. A track is an ordered list of topics
 * (milestones in the schema), each with four slots (topic, lesson, recipe,
 * learning goal) and an optional community action. Topics are worked one at
 * a time: the first one not yet settled is the current one, and everything
 * after it waits.
 *
 * A topic completes when the member marks its learning goal done AND has
 * shown the work, per §14 "Completion":
 *
 * - the topic's lesson watched to 80%, or
 * - a cooked-it post (photo, video or recipe) published since the topic
 *   opened.
 *
 * A topic with neither a lesson nor a recipe has nothing to show, so the goal
 * alone completes it.
 *
 * **A skip settles a topic without completing it.** It unlocks the next one
 * and is never an achievement: it lives in its own column, is rendered as its
 * own state, and is excluded from the completed count. Recording a skip as a
 * completion would have earned streaks and badges nobody cooked for.
 *
 * **Pacing is the member's** (DEC-080, `lib/roadmap/pacing.ts`): one to four
 * weeks per topic. It plans time and never moves progress — a pace change
 * touches `weeksPerTopic` and nothing else, and the clock for the current
 * topic (`topicStartedAt`) only restarts when the topic itself changes.
 *
 * Personalisation follows §14 — one track, three modifiers, rather than 128
 * separate roadmaps — fed by the answers the member already gave
 * (`lib/roadmap/personalisation.ts`), never by a second questionnaire:
 *
 * - **Cook Vibe = Track.** The persona marks the matching track as suggested.
 * - **Gluten Free = Filter.** A milestone may carry a second recipe; the answer
 *   decides which one the member is shown.
 * - **Suckiest Thing = Constraint** and **Primary Benefit = Framing.** Keyed
 *   text on the milestone, surfaced only when the member's answer has a key.
 */

/**
 * The cadence the roadmap used before pacing (DEC-080). Kept because the
 * column still exists, the Kit sync still reports it, and the automation
 * triggers still schedule by it; the member page no longer offers it.
 */
export const CADENCES = ["weekly", "biweekly", "monthly", "self-paced"] as const;
export type Cadence = (typeof CADENCES)[number];

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  "self-paced": "Self-paced",
};

const CADENCE_DAYS: Record<Cadence, number | null> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  "self-paced": null,
};

/** How much of a lesson counts as watched, per BUILD.md §14. */
export const LESSON_WATCHED_FRACTION = 0.8;

/** Post types that count as proof of cooking something. */
export const COOKED_POST_TYPES = ["RECIPE", "IMAGE", "VIDEO"] as const;

export function isCadence(value: unknown): value is Cadence {
  return typeof value === "string" && (CADENCES as readonly string[]).includes(value);
}

/**
 * Every refusal a member can see, by code. The code travels in the URL and the
 * text is looked up here, so a crafted link cannot put words on the page.
 */
export const ROADMAP_ERRORS = {
  "no-roadmap": "Start a roadmap first.",
  "no-track": "That track is not available.",
  "empty-track": "That track has no topics yet.",
  pace: "Choose between 1 and 4 weeks per topic.",
  paused: "Resume your roadmap to tick off this topic.",
  "not-current": "Only the topic you are on now can be ticked off.",
  "show-lesson": "Watch most of the class, or post what you cooked, then tick this off.",
  "show-cook": "Post what you cooked, then tick this off.",
  "no-recipe": "That topic has no recipe to swap.",
  "bad-recipe": "That recipe is not one we have.",
  busy: "That was a lot of clicks at once. Give it a moment and try again.",
  failed: "That did not save. Try again in a moment.",
} as const;
export type RoadmapErrorCode = keyof typeof ROADMAP_ERRORS;

export function roadmapErrorText(code: string | undefined): string | null {
  return code && code in ROADMAP_ERRORS ? ROADMAP_ERRORS[code as RoadmapErrorCode] : null;
}

export class RoadmapError extends Error {
  readonly code: RoadmapErrorCode;
  constructor(code: RoadmapErrorCode) {
    super(ROADMAP_ERRORS[code]);
    this.name = "RoadmapError";
    this.code = code;
  }
}

export type MilestoneState = "done" | "skipped" | "current" | "upcoming";

export type MilestoneRecipe = {
  id: string;
  title: string;
  /** True when this is the gluten-free stand-in rather than the authored one. */
  glutenFree: boolean;
  /** The post that introduced the recipe, when this member can open it. */
  href: string | null;
};

export type MilestoneView = {
  id: string;
  sortOrder: number;
  topic: string;
  learningGoal: string;
  communityAction: string | null;
  lesson: {
    title: string;
    courseTitle: string;
    href: string;
    watched: boolean;
  } | null;
  recipe: MilestoneRecipe | null;
  /** What the member cooked instead, when they swapped. */
  swappedRecipe: { id: string; title: string; href: string | null } | null;
  /** "Primary Benefit = Framing" — resolved for this member, or null. */
  framing: string | null;
  /** "Suckiest Thing = Constraint" — resolved for this member, or null. */
  constraintNote: string | null;
  state: MilestoneState;
  completedAt: Date | null;
  skippedAt: Date | null;
  /**
   * When this topic is planned to wrap up at the member's pace: the current
   * topic's planned end, or an upcoming one's. Null when settled or paused.
   */
  dueAt: Date | null;
  /** When an upcoming topic is planned to start. Null for every other state. */
  plannedStartAt: Date | null;
  /** Whether the "show the work" half of completion is already satisfied. */
  evidenceMet: boolean;
};

export type TrackSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  milestoneCount: number;
  /** The track the member's answers point to (§14 "Cook Vibe = Track"). */
  recommended: boolean;
};

/** The four §14 answers as the member gave them in the app (raw columns). */
export type RoadmapAnswers = {
  cookVibe: string | null;
  suckiestThing: string | null;
  glutenFree: boolean | null;
  primaryBenefit: string | null;
};

export type ActiveRoadmap = {
  id: string;
  /** The legacy cadence column, still reported to Kit. Not the pace. */
  cadence: Cadence;
  pausedAt: Date | null;
  startedAt: Date;
  track: { id: string; slug: string; name: string; description: string | null };
  milestones: MilestoneView[];
  completed: number;
  skipped: number;
  /**
   * What the member can swap the current recipe for. Loaded only when the
   * current milestone actually has a recipe, so the common case costs
   * nothing — a member with no swap to make never pays for the list.
   */
  recipeChoices: { id: string; title: string }[];
  /** The member's pace (DEC-080). */
  weeksPerTopic: WeeksPerTopic;
  /** The topic being worked on now; null once every topic is settled. */
  current: {
    index: number;
    milestoneId: string;
    /** Week X of N. Frozen at the moment of pausing while paused. */
    schedule: TopicSchedule;
  } | null;
  /** When the whole track is planned to wrap up at this pace. Null when paused or finished. */
  finishesAt: Date | null;
};

export type RoadmapPage = {
  /** The raw in-app answers. */
  answers: RoadmapAnswers;
  /** What the page says about the member, and which answers it acts on. */
  personalisation: Personalisation;
  /** True when no answer at all is known, so the sentence falls back. */
  needsAnswers: boolean;
  /** The member's own time zone, for dates. Null means the server's. */
  timezone: string | null;
  tracks: TrackSummary[];
  active: ActiveRoadmap | null;
};

/**
 * Where a milestone fell due under the legacy cadence: one interval per
 * milestone after the roadmap started. Pure. The automation triggers still
 * read this; the member page plans by pace instead (`topicSchedule`).
 */
export function dueDate(startedAt: Date, index: number, cadence: Cadence): Date | null {
  const days = CADENCE_DAYS[cadence];
  if (days === null) return null;
  return new Date(startedAt.getTime() + (index + 1) * days * 86_400_000);
}

/**
 * Settled ones, then exactly one current, then upcoming. Pure.
 *
 * "Settled" is completed *or* skipped: both move the member on, and only one of
 * them is an achievement. Keeping them distinct here is what stops a skip
 * rendering as a tick. The current one is `currentTopic`'s, so the page, the
 * rail and the Kit sync can never disagree about it.
 */
export function milestoneStates(
  settled: { done: boolean; skipped: boolean }[],
): MilestoneState[] {
  const current = currentTopic({ milestones: settled });
  return settled.map((row, index) => {
    if (row.done) return "done";
    if (row.skipped) return "skipped";
    return index === current?.index ? "current" : "upcoming";
  });
}

/** Whether a lesson's progress counts as watched to 80%. Pure. */
export function lessonWatched(
  progress: { completedAt: Date | null; furthestSeconds: number } | undefined,
  durationMin: number | null,
): boolean {
  if (!progress) return false;
  if (progress.completedAt) return true;
  if (!durationMin || durationMin <= 0) return false;
  return progress.furthestSeconds >= durationMin * 60 * LESSON_WATCHED_FRACTION;
}

/**
 * Which recipe a member sees on a milestone. Pure.
 *
 * "Gluten Free = Filter" (§14): one milestone, two recipes. A member who said
 * they eat gluten free gets the substitute when one has been authored, and the
 * ordinary recipe when it has not — which is the honest fallback, because an
 * author who left it blank is saying the recipe is already fine.
 */
export function recipeForMember(
  milestone: { recipeId: string | null; recipeIdGlutenFree: string | null },
  glutenFree: boolean | null,
): { id: string; glutenFree: boolean } | null {
  if (glutenFree && milestone.recipeIdGlutenFree) {
    return { id: milestone.recipeIdGlutenFree, glutenFree: true };
  }
  if (milestone.recipeId) return { id: milestone.recipeId, glutenFree: false };
  return null;
}

/** The member's current roadmap: the one they most recently started. */
async function currentRoadmap(userId: string) {
  return prisma.memberRoadmap.findFirst({
    where: { userId, track: { published: true } },
    orderBy: { createdAt: "desc" },
    include: {
      track: {
        include: { milestones: { orderBy: { sortOrder: "asc" } } },
      },
      milestones: {
        select: {
          milestoneId: true,
          completedAt: true,
          skippedAt: true,
          swappedRecipeId: true,
        },
      },
    },
  });
}

type ProgressRow = { completedAt: Date | null; skippedAt: Date | null };

function settledFlags(
  milestones: { id: string }[],
  progressBy: Map<string, ProgressRow>,
): { done: boolean; skipped: boolean }[] {
  return milestones.map((milestone) => ({
    done: Boolean(progressBy.get(milestone.id)?.completedAt),
    skipped: Boolean(progressBy.get(milestone.id)?.skippedAt),
  }));
}

/** The member's answers, resolved from every place they were given. */
async function loadPersonalisation(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      cookVibe: true,
      suckiestThing: true,
      glutenFree: true,
      primaryBenefit: true,
      skill: true,
      surveyTraits: true,
      timezone: true,
      interests: {
        where: { interest: { kind: "DIETARY" } },
        select: { interest: { select: { slug: true } } },
      },
    },
  });
  const answers: RoadmapAnswers = {
    cookVibe: profile?.cookVibe ?? null,
    suckiestThing: profile?.suckiestThing ?? null,
    glutenFree: profile?.glutenFree ?? null,
    primaryBenefit: profile?.primaryBenefit ?? null,
  };
  const personalisation = resolvePersonalisation({
    ...answers,
    skill: profile?.skill ?? null,
    dietary: profile?.interests.map((row) => row.interest.slug) ?? [],
    surveyTraits: profile?.surveyTraits ?? null,
  });
  return { answers, personalisation, timezone: profile?.timezone ?? null };
}

/**
 * The post each recipe was shared in, for the ones this member can open.
 *
 * A recipe has no page of its own; it lives on the post that introduced it.
 * A link into a room the member cannot enter would only be a dead end, so the
 * same door check the post page uses decides whether there is a link at all.
 */
async function recipeLinks(userId: string, recipeIds: string[]): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (recipeIds.length === 0) return links;
  const [viewer, posts] = await Promise.all([
    getUserAuth(userId),
    prisma.post.findMany({
      where: { recipeId: { in: recipeIds }, status: "PUBLISHED" },
      orderBy: { publishedAt: "asc" },
      take: 20,
      select: {
        id: true,
        recipeId: true,
        spaceId: true,
        space: {
          select: { visibility: true, postingPermission: true, productId: true },
        },
      },
    }),
  ]);
  if (!viewer || posts.length === 0) return links;
  const memberships = await prisma.spaceMembership.findMany({
    where: { userId, spaceId: { in: [...new Set(posts.map((post) => post.spaceId))] } },
    select: { spaceId: true, role: true },
  });
  const membershipBySpace = new Map(memberships.map((row) => [row.spaceId, { role: row.role }]));
  for (const post of posts) {
    if (!post.recipeId || links.has(post.recipeId)) continue;
    if (canEnterSpace(viewer, post.space, membershipBySpace.get(post.spaceId) ?? null)) {
      links.set(post.recipeId, `/posts/${post.id}`);
    }
  }
  return links;
}

export async function loadRoadmapPage(
  userId: string,
  now: Date = new Date(),
): Promise<RoadmapPage> {
  const [{ answers, personalisation, timezone }, tracks, roadmap] = await Promise.all([
    loadPersonalisation(userId),
    prisma.roadmapTrack.findMany({
      where: { published: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        _count: { select: { milestones: true } },
      },
    }),
    currentRoadmap(userId),
  ]);

  const summaries: TrackSummary[] = tracks.map((track) => ({
    id: track.id,
    slug: track.slug,
    name: track.name,
    description: track.description,
    milestoneCount: track._count.milestones,
    recommended: trackMatchesPersona(track, personalisation.persona, answers.cookVibe),
  }));

  const base = {
    answers,
    personalisation,
    needsAnswers: !personalisation.known,
    timezone,
    tracks: summaries,
  };
  if (!roadmap) return { ...base, active: null };

  const milestones = roadmap.track.milestones;
  const progressBy = new Map(roadmap.milestones.map((row) => [row.milestoneId, row]));
  const doneAt = new Map(
    roadmap.milestones
      .filter((row) => row.completedAt)
      .map((row) => [row.milestoneId, row.completedAt as Date]),
  );

  const flags = settledFlags(milestones, progressBy);
  const states = milestoneStates(flags);
  const cadence: Cadence = isCadence(roadmap.cadence) ? roadmap.cadence : "weekly";
  const current = currentTopic({ milestones: flags });
  const currentIndex = current?.index ?? -1;

  // The pace, and where the current topic stands against it. A paused clock
  // reads at the moment it was paused; nothing is planned while paused.
  const weeksPerTopic = effectiveWeeksPerTopic(roadmap);
  const paused = Boolean(roadmap.pausedAt);
  const schedule = current
    ? topicSchedule(
        roadmap.topicStartedAt ??
          openedAt(roadmap.createdAt, milestones, progressBy, current.index),
        weeksPerTopic,
        roadmap.pausedAt ?? now,
      )
    : null;
  const upcomingIndexes = states.flatMap((state, index) => (state === "upcoming" ? [index] : []));
  const starts =
    schedule && !paused ? upcomingTopicStarts(schedule, upcomingIndexes.length, now) : [];
  const startByIndex = new Map(upcomingIndexes.map((index, order) => [index, starts[order]]));
  const finishesAt =
    schedule && !paused ? plannedFinish(schedule, upcomingIndexes.length, now) : null;
  const weekMs = weeksPerTopic * 7 * 86_400_000;

  const lessonIds = milestones.map((m) => m.lessonId).filter((id): id is string => Boolean(id));
  // Every recipe that could be shown: the authored one, the gluten-free
  // stand-in, and anything the member swapped in.
  const recipeIds = [
    ...new Set(
      [
        ...milestones.map((m) => m.recipeId),
        ...milestones.map((m) => m.recipeIdGlutenFree),
        ...roadmap.milestones.map((row) => row.swappedRecipeId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  const [lessons, progress, recipes] = await Promise.all([
    lessonIds.length
      ? prisma.lesson.findMany({
          where: { id: { in: lessonIds } },
          select: {
            id: true,
            slug: true,
            title: true,
            durationMin: true,
            section: { select: { course: { select: { slug: true, title: true } } } },
          },
        })
      : [],
    lessonIds.length
      ? prisma.lessonProgress.findMany({
          where: { userId, lessonId: { in: lessonIds } },
          select: { lessonId: true, completedAt: true, furthestSeconds: true },
        })
      : [],
    recipeIds.length
      ? prisma.recipe.findMany({
          where: { id: { in: recipeIds } },
          select: { id: true, title: true },
        })
      : [],
  ]);
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const progressByLesson = new Map(progress.map((row) => [row.lessonId, row]));
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  // Evidence for the current milestone only: it is the only one that can be
  // completed, and the cooked-it window starts when it opened.
  let currentEvidence = false;
  if (currentIndex >= 0) {
    currentEvidence = await evidenceMet(userId, {
      milestone: milestones[currentIndex]!,
      openedAt: openedAt(roadmap.createdAt, milestones, progressBy, currentIndex),
    });
  }

  // Only the current milestone can be swapped, so only it can need the list
  // — and only its recipes are worth a link.
  const currentMilestone = currentIndex >= 0 ? milestones[currentIndex]! : null;
  const currentHasRecipe = Boolean(
    currentMilestone && (currentMilestone.recipeId || currentMilestone.recipeIdGlutenFree),
  );
  const currentRecipeIds = currentMilestone
    ? [
        recipeForMember(currentMilestone, personalisation.glutenFree)?.id,
        progressBy.get(currentMilestone.id)?.swappedRecipeId,
      ].filter((id): id is string => Boolean(id))
    : [];
  const [recipeChoices, links] = await Promise.all([
    currentHasRecipe
      ? prisma.recipe.findMany({
          orderBy: { title: "asc" },
          select: { id: true, title: true },
          take: 200,
        })
      : Promise.resolve([] as { id: string; title: string }[]),
    recipeLinks(userId, currentRecipeIds),
  ]);

  const views: MilestoneView[] = milestones.map((milestone, index) => {
    const lesson = milestone.lessonId ? lessonById.get(milestone.lessonId) : undefined;
    const row = progressBy.get(milestone.id);
    const chosen = recipeForMember(milestone, personalisation.glutenFree);
    const recipe = chosen ? recipeById.get(chosen.id) : undefined;
    const swapped = row?.swappedRecipeId ? recipeById.get(row.swappedRecipeId) : undefined;
    const state = states[index]!;
    const plannedStartAt = state === "upcoming" ? (startByIndex.get(index) ?? null) : null;

    let dueAt: Date | null = null;
    if (!paused && state === "current" && schedule) dueAt = schedule.endsAt;
    if (plannedStartAt) dueAt = new Date(plannedStartAt.getTime() + weekMs);

    return {
      id: milestone.id,
      sortOrder: milestone.sortOrder,
      topic: milestone.topic,
      learningGoal: milestone.learningGoal,
      communityAction: milestone.communityAction,
      lesson: lesson
        ? {
            title: lesson.title,
            courseTitle: lesson.section.course.title,
            href: `/learn/${lesson.section.course.slug}/${lesson.slug}`,
            watched: lessonWatched(progressByLesson.get(lesson.id), lesson.durationMin),
          }
        : null,
      recipe:
        recipe && chosen
          ? {
              id: recipe.id,
              title: recipe.title,
              glutenFree: chosen.glutenFree,
              href: links.get(recipe.id) ?? null,
            }
          : null,
      swappedRecipe: swapped
        ? { id: swapped.id, title: swapped.title, href: links.get(swapped.id) ?? null }
        : null,
      framing: keyedText(milestone.framing, personalisation.primaryBenefit),
      constraintNote: keyedText(milestone.constraintNote, personalisation.suckiestThing),
      state,
      completedAt: row?.completedAt ?? null,
      skippedAt: row?.skippedAt ?? null,
      dueAt,
      plannedStartAt,
      evidenceMet: index === currentIndex ? currentEvidence : state === "done",
    };
  });

  return {
    ...base,
    active: {
      id: roadmap.id,
      cadence,
      pausedAt: roadmap.pausedAt,
      startedAt: roadmap.createdAt,
      track: {
        id: roadmap.track.id,
        slug: roadmap.track.slug,
        name: roadmap.track.name,
        description: roadmap.track.description,
      },
      milestones: views,
      completed: doneAt.size,
      skipped: roadmap.milestones.filter((row) => row.skippedAt).length,
      recipeChoices,
      weeksPerTopic,
      current:
        current && schedule
          ? { index: current.index, milestoneId: milestones[current.index]!.id, schedule }
          : null,
      finishesAt,
    },
  };
}

/** A milestone opens when the one before it settled, or when the roadmap began. */
function openedAt(
  startedAt: Date,
  milestones: { id: string }[],
  progressBy: Map<string, ProgressRow>,
  index: number,
): Date {
  if (index === 0) return startedAt;
  const previous = progressBy.get(milestones[index - 1]!.id);
  return previous?.completedAt ?? previous?.skippedAt ?? startedAt;
}

async function evidenceMet(
  userId: string,
  input: {
    milestone: { lessonId: string | null; recipeId: string | null };
    openedAt: Date;
  },
): Promise<boolean> {
  const { milestone } = input;
  if (!milestone.lessonId && !milestone.recipeId) return true;

  if (milestone.lessonId) {
    const [lesson, progress] = await Promise.all([
      prisma.lesson.findUnique({
        where: { id: milestone.lessonId },
        select: { durationMin: true },
      }),
      prisma.lessonProgress.findUnique({
        where: { lessonId_userId: { lessonId: milestone.lessonId, userId } },
        select: { completedAt: true, furthestSeconds: true },
      }),
    ]);
    if (lessonWatched(progress ?? undefined, lesson?.durationMin ?? null)) return true;
  }

  const cooked = await prisma.post.findFirst({
    where: {
      authorId: userId,
      status: "PUBLISHED",
      type: { in: [...COOKED_POST_TYPES] },
      OR: [
        ...(milestone.recipeId ? [{ recipeId: milestone.recipeId }] : []),
        { publishedAt: { gte: input.openedAt } },
      ],
    },
    select: { id: true },
  });
  return cooked !== null;
}

// ---------------------------------------------------------------------------
// The Kitchen Table rail: what the member is working on (DEC-080, contract C5)

export type RoadmapFocus = {
  track: { name: string };
  paused: boolean;
  weeksPerTopic: WeeksPerTopic;
  /** Null once every topic on the track is settled. */
  topic: {
    title: string;
    /** 1-based position in the track. */
    number: number;
    total: number;
    lesson: { title: string; href: string } | null;
    /** The topic after this one, if any. */
    next: string | null;
    schedule: TopicSchedule;
  } | null;
};

/**
 * The member's current topic, for the rail. Null without a roadmap.
 *
 * Two small reads rather than `loadRoadmapPage`: the rail needs where the
 * member is and what to open next, not evidence, recipes or the swap list.
 */
export async function loadRoadmapFocus(
  userId: string,
  now: Date = new Date(),
): Promise<RoadmapFocus | null> {
  const roadmap = await prisma.memberRoadmap.findFirst({
    where: { userId, track: { published: true } },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      cadence: true,
      weeksPerTopic: true,
      pacingUpdatedAt: true,
      topicStartedAt: true,
      pausedAt: true,
      track: {
        select: {
          name: true,
          milestones: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, topic: true, lessonId: true },
          },
        },
      },
      milestones: { select: { milestoneId: true, completedAt: true, skippedAt: true } },
    },
  });
  if (!roadmap || roadmap.track.milestones.length === 0) return null;

  const milestones = roadmap.track.milestones;
  const progressBy = new Map(roadmap.milestones.map((row) => [row.milestoneId, row]));
  const flags = milestones.map((milestone, index) => ({
    done: Boolean(progressBy.get(milestone.id)?.completedAt),
    skipped: Boolean(progressBy.get(milestone.id)?.skippedAt),
    index,
  }));
  const current = currentTopic({ milestones: flags });
  const weeksPerTopic = effectiveWeeksPerTopic(roadmap);
  const base = {
    track: { name: roadmap.track.name },
    paused: Boolean(roadmap.pausedAt),
    weeksPerTopic,
  };
  if (!current) return { ...base, topic: null };

  const milestone = milestones[current.index]!;
  const lesson = milestone.lessonId
    ? await prisma.lesson.findUnique({
        where: { id: milestone.lessonId },
        select: { slug: true, title: true, section: { select: { course: { select: { slug: true } } } } },
      })
    : null;

  return {
    ...base,
    topic: {
      title: milestone.topic,
      number: current.index + 1,
      total: milestones.length,
      lesson: lesson
        ? { title: lesson.title, href: `/learn/${lesson.section.course.slug}/${lesson.slug}` }
        : null,
      next: current.next ? milestones[current.next.index]!.topic : null,
      schedule: topicSchedule(
        roadmap.topicStartedAt ??
          openedAt(roadmap.createdAt, milestones, progressBy, current.index),
        weeksPerTopic,
        roadmap.pausedAt ?? now,
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// The console: how members pace a track

/**
 * How many members on a track are at each pace. Two grouped counts: a chosen
 * pace by its weeks, and a roadmap from before pacing by its old cadence —
 * read through `effectiveWeeksPerTopic`, exactly as the member page reads it.
 */
export async function paceBreakdown(trackId: string): Promise<Record<WeeksPerTopic, number>> {
  const [chosen, legacy] = await Promise.all([
    prisma.memberRoadmap.groupBy({
      by: ["weeksPerTopic"],
      where: { trackId, pacingUpdatedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.memberRoadmap.groupBy({
      by: ["cadence", "weeksPerTopic"],
      where: { trackId, pacingUpdatedAt: null },
      _count: { _all: true },
    }),
  ]);
  const counts = Object.fromEntries(WEEKS_PER_TOPIC_OPTIONS.map((weeks) => [weeks, 0])) as Record<
    WeeksPerTopic,
    number
  >;
  const marker = new Date(0);
  for (const row of chosen) {
    counts[effectiveWeeksPerTopic({ ...row, pacingUpdatedAt: marker })] += row._count._all;
  }
  for (const row of legacy) {
    counts[effectiveWeeksPerTopic({ ...row, pacingUpdatedAt: null })] += row._count._all;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Writes. Every one is scoped to the member's own roadmap.
// ---------------------------------------------------------------------------

async function ownRoadmap(userId: string) {
  const roadmap = await currentRoadmap(userId);
  if (!roadmap) throw new RoadmapError("no-roadmap");
  return roadmap;
}

/** The current milestone, or a refusal. Shared by tick, skip and swap. */
function currentMilestoneOf(
  roadmap: NonNullable<Awaited<ReturnType<typeof currentRoadmap>>>,
  milestoneId: string,
) {
  const milestones = roadmap.track.milestones;
  const progressBy = new Map(roadmap.milestones.map((row) => [row.milestoneId, row]));
  const flags = settledFlags(milestones, progressBy);
  const current = currentTopic({ milestones: flags });
  if (!current || milestones[current.index]!.id !== milestoneId) {
    throw new RoadmapError("not-current");
  }
  const index = current.index;
  return {
    index,
    milestone: milestones[index]!,
    milestones,
    progressBy,
    /** Whether settling this one leaves nothing open: the track is finished. */
    last: current.upcoming === 0,
  };
}

/**
 * Save the four answers — §14 "Four member answers".
 *
 * The roadmap page no longer asks these (DEC-080: members answered them at
 * onboarding), but this stays the one way to write them, for an import or a
 * console tool. Every field is optional and anything outside the vocabulary
 * becomes null, so a stale form cannot write a value the rest of the system
 * will never match on.
 */
export async function saveAnswers(
  userId: string,
  input: {
    cookVibe?: unknown;
    suckiestThing?: unknown;
    glutenFree?: unknown;
    primaryBenefit?: unknown;
  },
) {
  const data = {
    cookVibe: normalizeAnswer(COOK_VIBES, input.cookVibe),
    suckiestThing: normalizeAnswer(SUCKIEST_THINGS, input.suckiestThing),
    glutenFree: normalizeGlutenFree(input.glutenFree),
    primaryBenefit: normalizeAnswer(PRIMARY_BENEFITS, input.primaryBenefit),
  };

  // `displayName` is required on a Profile, and a member can reach the roadmap
  // before they have one. Their own name is the only honest default — inventing
  // a placeholder here would put it on their posts.
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, handle: true },
  });

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, displayName: user.name || user.handle, ...data },
    update: data,
  });
  return data;
}

/**
 * Start a track, or switch to one. A member follows one track at a time, so
 * any other roadmap they held is removed along with its ticks: progress on a
 * track is only meaningful on that track.
 *
 * The pace comes from `options.weeksPerTopic` when given; otherwise it carries
 * over from the roadmap the member already had (switching tracks is not a
 * reason to forget how fast they like to go), and a first roadmap starts at a
 * week per topic. The first topic's clock starts now.
 */
export async function startTrack(
  userId: string,
  trackId: string,
  options: { weeksPerTopic?: number; now?: Date } = {},
): Promise<{ weeksPerTopic: WeeksPerTopic }> {
  let chosen: WeeksPerTopic | null = null;
  if (options.weeksPerTopic !== undefined) {
    chosen = parseWeeksPerTopic(options.weeksPerTopic);
    if (!chosen) throw new RoadmapError("pace");
  }

  const track = await prisma.roadmapTrack.findFirst({
    where: { id: trackId, published: true },
    select: { id: true, _count: { select: { milestones: true } } },
  });
  if (!track) throw new RoadmapError("no-track");
  if (track._count.milestones === 0) throw new RoadmapError("empty-track");

  const now = options.now ?? new Date();
  const held = await prisma.memberRoadmap.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      trackId: true,
      cadence: true,
      weeksPerTopic: true,
      pacingUpdatedAt: true,
      pausedAt: true,
      topicStartedAt: true,
    },
  });
  const same = held.find((row) => row.trackId === trackId);
  const previous = same ?? held[0];
  const weeksPerTopic =
    chosen ?? (previous ? effectiveWeeksPerTopic(previous) : DEFAULT_WEEKS_PER_TOPIC);

  await prisma.$transaction([
    prisma.memberRoadmap.deleteMany({ where: { userId, trackId: { not: trackId } } }),
    prisma.memberRoadmap.upsert({
      where: { userId_trackId: { userId, trackId } },
      create: { userId, trackId, weeksPerTopic, pacingUpdatedAt: now, topicStartedAt: now },
      // Already on this track: carry on where they were. Starting ends a
      // pause, so the paused time comes off the current topic's clock.
      update: {
        pausedAt: null,
        weeksPerTopic,
        pacingUpdatedAt: now,
        ...(same?.pausedAt && same.topicStartedAt
          ? { topicStartedAt: resumedTopicStart(same.topicStartedAt, same.pausedAt, now) }
          : {}),
      },
    }),
  ]);
  return { weeksPerTopic };
}

/**
 * Change the pace — DEC-080. Weeks per topic and when it was set, nothing
 * else: no progress row is touched and the current topic keeps its start, so
 * the member stays exactly where they are and only the plan around them moves.
 */
export async function setPace(
  userId: string,
  weeksPerTopic: unknown,
): Promise<{ weeksPerTopic: WeeksPerTopic }> {
  const weeks = parseWeeksPerTopic(weeksPerTopic);
  if (!weeks) throw new RoadmapError("pace");
  const roadmap = await prisma.memberRoadmap.findFirst({
    where: { userId, track: { published: true } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!roadmap) throw new RoadmapError("no-roadmap");
  await prisma.memberRoadmap.update({
    where: { id: roadmap.id },
    data: { weeksPerTopic: weeks, pacingUpdatedAt: new Date() },
  });
  return { weeksPerTopic: weeks };
}

/**
 * Pause or resume. Pausing stops the current topic's clock: on resume the
 * time spent paused comes off it, so a member who paused in week 2 comes back
 * to week 2. Pausing twice keeps the first pause's time.
 */
export async function setPaused(userId: string, paused: boolean, now: Date = new Date()) {
  const roadmap = await ownRoadmap(userId);
  if (paused) {
    if (roadmap.pausedAt) return;
    await prisma.memberRoadmap.update({ where: { id: roadmap.id }, data: { pausedAt: now } });
    return;
  }
  if (!roadmap.pausedAt) return;

  const progressBy = new Map(roadmap.milestones.map((row) => [row.milestoneId, row]));
  const current = currentTopic({
    milestones: settledFlags(roadmap.track.milestones, progressBy),
  });
  const anchor = current
    ? (roadmap.topicStartedAt ??
      openedAt(roadmap.createdAt, roadmap.track.milestones, progressBy, current.index))
    : null;
  await prisma.memberRoadmap.update({
    where: { id: roadmap.id },
    data: {
      pausedAt: null,
      ...(anchor ? { topicStartedAt: resumedTopicStart(anchor, roadmap.pausedAt, now) } : {}),
    },
  });
}

/** Clear every tick and begin the track again from its first topic, at the same pace. */
export async function restartTrack(userId: string) {
  const roadmap = await ownRoadmap(userId);
  const now = new Date();
  await prisma.$transaction([
    prisma.memberMilestoneProgress.deleteMany({ where: { memberRoadmapId: roadmap.id } }),
    prisma.memberRoadmap.update({
      where: { id: roadmap.id },
      data: { createdAt: now, pausedAt: null, topicStartedAt: now },
    }),
  ]);
}

/** Leave the roadmap entirely. */
export async function leaveRoadmap(userId: string) {
  const roadmap = await ownRoadmap(userId);
  await prisma.memberRoadmap.delete({ where: { id: roadmap.id } });
}

/**
 * Mark the current topic's learning goal done. Refuses anything but the
 * current topic, and refuses until the work has been shown. The next topic
 * becomes current and its clock starts, and the roadmap badge ladder is
 * re-checked after the response.
 */
export async function completeMilestone(userId: string, milestoneId: string) {
  const roadmap = await ownRoadmap(userId);
  if (roadmap.pausedAt) throw new RoadmapError("paused");

  const { index, milestone, milestones, progressBy, last } = currentMilestoneOf(
    roadmap,
    milestoneId,
  );

  const shown = await evidenceMet(userId, {
    milestone,
    openedAt: openedAt(roadmap.createdAt, milestones, progressBy, index),
  });
  if (!shown) {
    throw new RoadmapError(milestone.lessonId ? "show-lesson" : "show-cook");
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.memberMilestoneProgress.upsert({
      where: { memberRoadmapId_milestoneId: { memberRoadmapId: roadmap.id, milestoneId } },
      create: { memberRoadmapId: roadmap.id, milestoneId, completedAt: now },
      // A skip that is later completed properly becomes a completion.
      update: { completedAt: now, skippedAt: null },
    }),
    prisma.memberRoadmap.update({
      where: { id: roadmap.id },
      data: { topicStartedAt: last ? null : now },
    }),
  ]);

  await awardBadgesAfterResponse(userId, "roadmap-topic");

  return { trackComplete: last };
}

/**
 * Skip the current topic — §14 "Support".
 *
 * Needs no evidence, which is the whole point: a member who cannot do this one
 * should not be stuck behind it. It is not a completion and is never counted as
 * one, so `completedAt` stays null. The next topic's clock starts.
 */
export async function skipMilestone(userId: string, milestoneId: string) {
  const roadmap = await ownRoadmap(userId);
  if (roadmap.pausedAt) throw new RoadmapError("paused");
  const { last } = currentMilestoneOf(roadmap, milestoneId);

  const now = new Date();
  await prisma.$transaction([
    prisma.memberMilestoneProgress.upsert({
      where: { memberRoadmapId_milestoneId: { memberRoadmapId: roadmap.id, milestoneId } },
      create: { memberRoadmapId: roadmap.id, milestoneId, skippedAt: now },
      update: { skippedAt: now, completedAt: null },
    }),
    prisma.memberRoadmap.update({
      where: { id: roadmap.id },
      data: { topicStartedAt: last ? null : now },
    }),
  ]);

  return { trackComplete: last };
}

/**
 * Swap the recipe on the current topic — §14 "Support".
 *
 * The authored recipe is untouched; this records what the member actually
 * cooked. Passing null clears the swap and puts the authored one back.
 */
export async function swapRecipe(
  userId: string,
  milestoneId: string,
  recipeId: string | null,
) {
  const roadmap = await ownRoadmap(userId);
  const { milestone } = currentMilestoneOf(roadmap, milestoneId);
  if (!milestone.recipeId && !milestone.recipeIdGlutenFree) {
    throw new RoadmapError("no-recipe");
  }

  if (recipeId) {
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: { id: true },
    });
    if (!recipe) throw new RoadmapError("bad-recipe");
  }

  await prisma.memberMilestoneProgress.upsert({
    where: { memberRoadmapId_milestoneId: { memberRoadmapId: roadmap.id, milestoneId } },
    create: { memberRoadmapId: roadmap.id, milestoneId, swappedRecipeId: recipeId },
    update: { swappedRecipeId: recipeId },
  });
}
