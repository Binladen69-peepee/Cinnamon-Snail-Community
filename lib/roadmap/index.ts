import "server-only";
import { prisma } from "@/lib/db";

/**
 * The personalised learning roadmap — BUILD.md §14.
 *
 * A member follows one track at a time. A track is an ordered list of
 * milestones, each with four slots (topic, lesson, recipe, learning goal) and
 * an optional community action. Milestones unlock in order: the first one not
 * yet complete is the current one, and everything after it waits.
 *
 * A milestone completes when the member marks its learning goal done AND has
 * shown the work, per §14 "Completion":
 *
 * - the milestone's lesson watched to 80%, or
 * - a cooked-it post (photo, video or recipe) published since the milestone
 *   opened.
 *
 * A milestone with neither a lesson nor a recipe has nothing to show, so the
 * goal alone completes it.
 *
 * Deliberately not here yet, because the schema has nowhere to keep them:
 * skipping a milestone and swapping its recipe. Both would need a column on
 * `MemberMilestoneProgress`, and a skip recorded as a completion would count
 * towards badges it was never earned for.
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
  "empty-track": "That track has no milestones yet.",
  cadence: "Choose how often you want a milestone.",
  paused: "Resume your roadmap to tick off milestones.",
  "not-current": "Only the current milestone can be ticked off.",
  "show-lesson": "Watch most of the lesson, or post what you cooked, then tick this off.",
  "show-cook": "Post what you cooked, then tick this off.",
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

export type MilestoneState = "done" | "current" | "upcoming";

export type MilestoneView = {
  id: string;
  sortOrder: number;
  topic: string;
  learningGoal: string;
  communityAction: string | null;
  lesson: { title: string; href: string; watched: boolean } | null;
  recipe: { title: string } | null;
  state: MilestoneState;
  completedAt: Date | null;
  /** When this milestone is due at the member's cadence. Null when self-paced or paused. */
  dueAt: Date | null;
  /** Whether the "show the work" half of completion is already satisfied. */
  evidenceMet: boolean;
};

export type TrackSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  milestoneCount: number;
  recommended: boolean;
};

export type RoadmapPage = {
  answers: {
    cookVibe: string | null;
    suckiestThing: string | null;
    glutenFree: boolean | null;
    primaryBenefit: string | null;
  };
  tracks: TrackSummary[];
  active: {
    id: string;
    cadence: Cadence;
    pausedAt: Date | null;
    startedAt: Date;
    track: { id: string; slug: string; name: string; description: string | null };
    milestones: MilestoneView[];
    completed: number;
  } | null;
};

/**
 * Where a milestone falls due: one cadence interval per milestone after the
 * roadmap started. Pure, so the schedule can be tested without a database.
 */
export function dueDate(startedAt: Date, index: number, cadence: Cadence): Date | null {
  const days = CADENCE_DAYS[cadence];
  if (days === null) return null;
  return new Date(startedAt.getTime() + (index + 1) * days * 86_400_000);
}

/** Done, then exactly one current, then upcoming. Pure. */
export function milestoneStates(completed: boolean[]): MilestoneState[] {
  const current = completed.findIndex((done) => !done);
  return completed.map((done, index) =>
    done ? "done" : index === current ? "current" : "upcoming",
  );
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

/** The member's current roadmap: the one they most recently started. */
async function currentRoadmap(userId: string) {
  return prisma.memberRoadmap.findFirst({
    where: { userId, track: { published: true } },
    orderBy: { createdAt: "desc" },
    include: {
      track: {
        include: { milestones: { orderBy: { sortOrder: "asc" } } },
      },
      milestones: { select: { milestoneId: true, completedAt: true } },
    },
  });
}

export async function loadRoadmapPage(userId: string): Promise<RoadmapPage> {
  const [profile, tracks, roadmap] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      select: { cookVibe: true, suckiestThing: true, glutenFree: true, primaryBenefit: true },
    }),
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

  const vibe = profile?.cookVibe?.trim().toLowerCase() ?? "";
  const summaries: TrackSummary[] = tracks.map((track) => ({
    id: track.id,
    slug: track.slug,
    name: track.name,
    description: track.description,
    milestoneCount: track._count.milestones,
    // "Cook Vibe = Track" (§14): the answer names the track it belongs on.
    recommended:
      vibe.length > 0 &&
      (track.slug.toLowerCase() === vibe || track.name.toLowerCase().includes(vibe)),
  }));

  const answers = {
    cookVibe: profile?.cookVibe ?? null,
    suckiestThing: profile?.suckiestThing ?? null,
    glutenFree: profile?.glutenFree ?? null,
    primaryBenefit: profile?.primaryBenefit ?? null,
  };

  if (!roadmap) return { answers, tracks: summaries, active: null };

  const milestones = roadmap.track.milestones;
  const doneAt = new Map(
    roadmap.milestones
      .filter((row) => row.completedAt)
      .map((row) => [row.milestoneId, row.completedAt as Date]),
  );

  const lessonIds = milestones.map((m) => m.lessonId).filter((id): id is string => Boolean(id));
  const recipeIds = milestones.map((m) => m.recipeId).filter((id): id is string => Boolean(id));

  const [lessons, progress, recipes] = await Promise.all([
    lessonIds.length
      ? prisma.lesson.findMany({
          where: { id: { in: lessonIds } },
          select: {
            id: true,
            slug: true,
            title: true,
            durationMin: true,
            section: { select: { course: { select: { slug: true } } } },
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

  const states = milestoneStates(milestones.map((m) => doneAt.has(m.id)));
  const cadence: Cadence = isCadence(roadmap.cadence) ? roadmap.cadence : "weekly";
  const currentIndex = states.indexOf("current");

  // Evidence for the current milestone only: it is the only one that can be
  // completed, and the cooked-it window starts when it opened.
  let currentEvidence = false;
  if (currentIndex >= 0) {
    currentEvidence = await evidenceMet(userId, {
      milestone: milestones[currentIndex],
      openedAt: openedAt(roadmap.createdAt, milestones, doneAt, currentIndex),
    });
  }

  const views: MilestoneView[] = milestones.map((milestone, index) => {
    const lesson = milestone.lessonId ? lessonById.get(milestone.lessonId) : undefined;
    const recipe = milestone.recipeId ? recipeById.get(milestone.recipeId) : undefined;
    return {
      id: milestone.id,
      sortOrder: milestone.sortOrder,
      topic: milestone.topic,
      learningGoal: milestone.learningGoal,
      communityAction: milestone.communityAction,
      lesson: lesson
        ? {
            title: lesson.title,
            href: `/learn/${lesson.section.course.slug}/${lesson.slug}`,
            watched: lessonWatched(progressByLesson.get(lesson.id), lesson.durationMin),
          }
        : null,
      recipe: recipe ? { title: recipe.title } : null,
      state: states[index],
      completedAt: doneAt.get(milestone.id) ?? null,
      dueAt:
        roadmap.pausedAt || states[index] === "done"
          ? null
          : dueDate(roadmap.createdAt, index, cadence),
      evidenceMet: index === currentIndex ? currentEvidence : states[index] === "done",
    };
  });

  return {
    answers,
    tracks: summaries,
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
    },
  };
}

/** A milestone opens when the one before it completed, or when the roadmap began. */
function openedAt(
  startedAt: Date,
  milestones: { id: string }[],
  doneAt: Map<string, Date>,
  index: number,
): Date {
  if (index === 0) return startedAt;
  return doneAt.get(milestones[index - 1].id) ?? startedAt;
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
// Writes. Every one is scoped to the member's own roadmap.
// ---------------------------------------------------------------------------

async function ownRoadmap(userId: string) {
  const roadmap = await currentRoadmap(userId);
  if (!roadmap) throw new RoadmapError("no-roadmap");
  return roadmap;
}

/**
 * Start a track, or switch to one. A member follows one track at a time, so
 * any other roadmap they held is removed along with its ticks: progress on a
 * track is only meaningful on that track.
 */
export async function startTrack(userId: string, trackId: string, cadence: Cadence) {
  const track = await prisma.roadmapTrack.findFirst({
    where: { id: trackId, published: true },
    select: { id: true, _count: { select: { milestones: true } } },
  });
  if (!track) throw new RoadmapError("no-track");
  if (track._count.milestones === 0) throw new RoadmapError("empty-track");

  await prisma.$transaction([
    prisma.memberRoadmap.deleteMany({ where: { userId, trackId: { not: trackId } } }),
    prisma.memberRoadmap.upsert({
      where: { userId_trackId: { userId, trackId } },
      create: { userId, trackId, cadence },
      update: { cadence, pausedAt: null },
    }),
  ]);
}

export async function setCadence(userId: string, cadence: Cadence) {
  const roadmap = await ownRoadmap(userId);
  await prisma.memberRoadmap.update({ where: { id: roadmap.id }, data: { cadence } });
}

export async function setPaused(userId: string, paused: boolean) {
  const roadmap = await ownRoadmap(userId);
  await prisma.memberRoadmap.update({
    where: { id: roadmap.id },
    data: { pausedAt: paused ? new Date() : null },
  });
}

/** Clear every tick and begin the track again from its first milestone. */
export async function restartTrack(userId: string) {
  const roadmap = await ownRoadmap(userId);
  await prisma.$transaction([
    prisma.memberMilestoneProgress.deleteMany({ where: { memberRoadmapId: roadmap.id } }),
    prisma.memberRoadmap.update({
      where: { id: roadmap.id },
      data: { createdAt: new Date(), pausedAt: null },
    }),
  ]);
}

/** Leave the roadmap entirely. */
export async function leaveRoadmap(userId: string) {
  const roadmap = await ownRoadmap(userId);
  await prisma.memberRoadmap.delete({ where: { id: roadmap.id } });
}

/**
 * Mark the current milestone's learning goal done. Refuses anything but the
 * current milestone, and refuses until the work has been shown.
 */
export async function completeMilestone(userId: string, milestoneId: string) {
  const roadmap = await ownRoadmap(userId);
  if (roadmap.pausedAt) throw new RoadmapError("paused");

  const milestones = roadmap.track.milestones;
  const doneAt = new Map(
    roadmap.milestones
      .filter((row) => row.completedAt)
      .map((row) => [row.milestoneId, row.completedAt as Date]),
  );
  const index = milestoneStates(milestones.map((m) => doneAt.has(m.id))).indexOf("current");
  if (index < 0 || milestones[index].id !== milestoneId) {
    throw new RoadmapError("not-current");
  }

  const milestone = milestones[index];
  const shown = await evidenceMet(userId, {
    milestone,
    openedAt: openedAt(roadmap.createdAt, milestones, doneAt, index),
  });
  if (!shown) {
    throw new RoadmapError(milestone.lessonId ? "show-lesson" : "show-cook");
  }

  await prisma.memberMilestoneProgress.upsert({
    where: { memberRoadmapId_milestoneId: { memberRoadmapId: roadmap.id, milestoneId } },
    create: { memberRoadmapId: roadmap.id, milestoneId, completedAt: new Date() },
    update: { completedAt: new Date() },
  });

  return { trackComplete: index === milestones.length - 1 };
}
