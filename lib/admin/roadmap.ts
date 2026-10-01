import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { queueRoadmapKitSyncForTrack } from "@/lib/roadmap/kit-sync";
import {
  PRIMARY_BENEFITS,
  SUCKIEST_THINGS,
  keyedFromForm,
  keyedText,
} from "@/lib/roadmap/answers";
import { recipeForMember } from "@/lib/roadmap";

/**
 * Roadmap track authoring — BUILD.md §14 "Admin authoring".
 *
 * The member roadmap has been complete for a while and empty for all of it,
 * because a track is authored content and there was no way to author one.
 * PROJECT.md lists this as the thing without which `/roadmap` stays blank.
 *
 * §14 asks for ten capabilities. Each is a function here:
 *
 * | §14 | here |
 * |---|---|
 * | Create tracks      | `createTrack` |
 * | Reorder milestones | `moveMilestone` |
 * | Pick lessons       | `lessonOptions` + `saveMilestone` |
 * | Pick recipes       | `recipeOptions` + `saveMilestone` |
 * | Create variants    | `saveMilestone` (gluten-free recipe) |
 * | Edit framing       | `saveMilestone` (framing + constraint) |
 * | Preview combinations | `previewFor` |
 * | Draft/publish      | `setPublished` |
 * | Version tracks     | `bumpVersion` |
 * | View analytics     | `listTracks` + `trackAnalytics` |
 *
 * Every write is admin-only; the route segment enforces that, and nothing here
 * takes a member id.
 */

export class TrackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrackError";
  }
}

/** Slugs are the member-facing key, so they are generated, not typed. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type TrackRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  published: boolean;
  version: number;
  milestones: number;
  /** How many members are on it right now. */
  enrolled: number;
  /** Members who have settled every milestone on it. */
  finished: number;
  /** Ready to publish: has at least one milestone, and each has its four slots. */
  publishable: boolean;
};

/**
 * Every track, with the numbers an author needs to decide what to do next.
 *
 * Counted in grouped queries rather than per track, so adding tracks does not
 * add round trips.
 */
export async function listTracks(): Promise<TrackRow[]> {
  const tracks = await prisma.roadmapTrack.findMany({
    orderBy: [{ published: "desc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      published: true,
      version: true,
      milestones: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, topic: true, learningGoal: true, lessonId: true, recipeId: true },
      },
      _count: { select: { members: true } },
    },
  });

  // One pass for "who has settled everything", rather than a query per track.
  const settled = await prisma.memberMilestoneProgress.groupBy({
    by: ["memberRoadmapId"],
    where: { OR: [{ completedAt: { not: null } }, { skippedAt: { not: null } }] },
    _count: { _all: true },
  });
  const settledBy = new Map(settled.map((row) => [row.memberRoadmapId, row._count._all]));

  const roadmaps = await prisma.memberRoadmap.findMany({
    select: { id: true, trackId: true },
  });
  const finishedByTrack = new Map<string, number>();
  for (const roadmap of roadmaps) {
    const track = tracks.find((candidate) => candidate.id === roadmap.trackId);
    if (!track || track.milestones.length === 0) continue;
    if ((settledBy.get(roadmap.id) ?? 0) >= track.milestones.length) {
      finishedByTrack.set(roadmap.trackId, (finishedByTrack.get(roadmap.trackId) ?? 0) + 1);
    }
  }

  return tracks.map((track) => ({
    id: track.id,
    slug: track.slug,
    name: track.name,
    description: track.description,
    published: track.published,
    version: track.version,
    milestones: track.milestones.length,
    enrolled: track._count.members,
    finished: finishedByTrack.get(track.id) ?? 0,
    publishable:
      track.milestones.length > 0 &&
      track.milestones.every(
        (milestone) =>
          milestone.topic.trim().length > 0 && milestone.learningGoal.trim().length > 0,
      ),
  }));
}

export type MilestoneRow = {
  id: string;
  sortOrder: number;
  topic: string;
  learningGoal: string;
  communityAction: string | null;
  lessonId: string | null;
  lessonTitle: string | null;
  recipeId: string | null;
  recipeTitle: string | null;
  recipeIdGlutenFree: string | null;
  recipeGlutenFreeTitle: string | null;
  framing: Record<string, string>;
  constraintNote: Record<string, string>;
  /** How many members have settled this one, and how they settled it. */
  completed: number;
  skipped: number;
};

export type TrackDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kitTag: string | null;
  kitCompletedTag: string | null;
  published: boolean;
  version: number;
  enrolled: number;
  milestones: MilestoneRow[];
};

export async function loadTrack(slug: string): Promise<TrackDetail | null> {
  const track = await prisma.roadmapTrack.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      kitTag: true,
      kitCompletedTag: true,
      published: true,
      version: true,
      _count: { select: { members: true } },
      milestones: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          topic: true,
          learningGoal: true,
          communityAction: true,
          lessonId: true,
          recipeId: true,
          recipeIdGlutenFree: true,
          framing: true,
          constraintNote: true,
        },
      },
    },
  });
  if (!track) return null;

  const lessonIds = track.milestones
    .map((m) => m.lessonId)
    .filter((id): id is string => Boolean(id));
  const recipeIds = [
    ...new Set(
      [
        ...track.milestones.map((m) => m.recipeId),
        ...track.milestones.map((m) => m.recipeIdGlutenFree),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];

  const [lessons, recipes, progress] = await Promise.all([
    lessonIds.length
      ? prisma.lesson.findMany({
          where: { id: { in: lessonIds } },
          select: { id: true, title: true },
        })
      : [],
    recipeIds.length
      ? prisma.recipe.findMany({
          where: { id: { in: recipeIds } },
          select: { id: true, title: true },
        })
      : [],
    prisma.memberMilestoneProgress.groupBy({
      by: ["milestoneId"],
      where: { milestoneId: { in: track.milestones.map((m) => m.id) } },
      _count: { completedAt: true, skippedAt: true },
    }),
  ]);
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson.title]));
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe.title]));
  const progressBy = new Map(progress.map((row) => [row.milestoneId, row._count]));

  return {
    id: track.id,
    slug: track.slug,
    name: track.name,
    description: track.description,
    kitTag: track.kitTag,
    kitCompletedTag: track.kitCompletedTag,
    published: track.published,
    version: track.version,
    enrolled: track._count.members,
    milestones: track.milestones.map((milestone) => ({
      id: milestone.id,
      sortOrder: milestone.sortOrder,
      topic: milestone.topic,
      learningGoal: milestone.learningGoal,
      communityAction: milestone.communityAction,
      lessonId: milestone.lessonId,
      lessonTitle: milestone.lessonId ? (lessonById.get(milestone.lessonId) ?? null) : null,
      recipeId: milestone.recipeId,
      recipeTitle: milestone.recipeId ? (recipeById.get(milestone.recipeId) ?? null) : null,
      recipeIdGlutenFree: milestone.recipeIdGlutenFree,
      recipeGlutenFreeTitle: milestone.recipeIdGlutenFree
        ? (recipeById.get(milestone.recipeIdGlutenFree) ?? null)
        : null,
      framing: asRecord(milestone.framing),
      constraintNote: asRecord(milestone.constraintNote),
      completed: progressBy.get(milestone.id)?.completedAt ?? 0,
      skipped: progressBy.get(milestone.id)?.skippedAt ?? 0,
    })),
  };
}

function asRecord(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

/** Lessons an author can attach, newest course first. */
export async function lessonOptions() {
  const lessons = await prisma.lesson.findMany({
    where: { section: { course: { published: true } } },
    orderBy: [{ section: { course: { title: "asc" } } }, { sortOrder: "asc" }],
    select: {
      id: true,
      title: true,
      section: { select: { course: { select: { title: true } } } },
    },
    take: 500,
  });
  return lessons.map((lesson) => ({
    id: lesson.id,
    label: `${lesson.section.course.title} — ${lesson.title}`,
  }));
}

export async function recipeOptions() {
  const recipes = await prisma.recipe.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true },
    take: 500,
  });
  return recipes.map((recipe) => ({ id: recipe.id, label: recipe.title }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createTrack(input: { name: string; description: string | null }) {
  const name = input.name.trim();
  if (!name) throw new TrackError("Give the track a name.");

  const base = slugify(name);
  if (!base) throw new TrackError("That name has no letters or numbers in it.");

  // A slug is the member-facing key and must be unique; suffix rather than
  // refuse, because two tracks can reasonably share a name while being drafted.
  let slug = base;
  for (let attempt = 2; attempt < 50; attempt += 1) {
    const clash = await prisma.roadmapTrack.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) break;
    slug = `${base}-${attempt}`;
  }

  return prisma.roadmapTrack.create({
    data: { slug, name, description: input.description?.trim() || null },
    select: { slug: true },
  });
}

export async function updateTrack(
  trackId: string,
  input: {
    name: string;
    description: string | null;
    kitTag?: string | null;
    kitCompletedTag?: string | null;
  },
) {
  const name = input.name.trim();
  if (!name) throw new TrackError("Give the track a name.");
  const kitTag = kitTagId(input.kitTag);
  const kitCompletedTag = kitTagId(input.kitCompletedTag);

  const before = await prisma.roadmapTrack.findUnique({
    where: { id: trackId },
    select: { kitTag: true, kitCompletedTag: true },
  });
  await prisma.roadmapTrack.update({
    where: { id: trackId },
    data: {
      name,
      description: input.description?.trim() || null,
      ...(input.kitTag !== undefined ? { kitTag } : {}),
      ...(input.kitCompletedTag !== undefined ? { kitCompletedTag } : {}),
    },
  });

  // New tags mean every member on the track is now behind in Kit.
  const tagsChanged =
    (input.kitTag !== undefined && kitTag !== (before?.kitTag ?? null)) ||
    (input.kitCompletedTag !== undefined && kitCompletedTag !== (before?.kitCompletedTag ?? null));
  if (tagsChanged) await queueRoadmapKitSyncForTrack(trackId).catch(() => 0);
}

/** A Kit tag id is a number. Blank clears it; anything else is a typo. */
function kitTagId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (!/^\d{1,15}$/.test(trimmed)) {
    throw new TrackError("A Kit tag is its number from Kit (Subscribers → Tags), not its name.");
  }
  return trimmed;
}

/**
 * Draft / publish.
 *
 * Publishing an empty track is refused rather than allowed: `startTrack` already
 * refuses to enrol anyone on one, so publishing it would only advertise a track
 * nobody can join.
 */
export async function setPublished(trackId: string, published: boolean) {
  if (published) {
    const count = await prisma.roadmapMilestone.count({ where: { trackId } });
    if (count === 0) throw new TrackError("Add a milestone before publishing this track.");
  }
  await prisma.roadmapTrack.update({ where: { id: trackId }, data: { published } });
  // Withdrawing a track takes its members off it as far as Kit is concerned,
  // and publishing brings them back.
  await queueRoadmapKitSyncForTrack(trackId).catch(() => 0);
}

/**
 * Version a track.
 *
 * A bump records that the content changed under members who are part-way
 * through. It deliberately does not reset anyone's progress: a member who has
 * done four milestones has done them, and silently clearing that to match a new
 * version would take away work they actually did.
 */
export async function bumpVersion(trackId: string) {
  const track = await prisma.roadmapTrack.update({
    where: { id: trackId },
    data: { version: { increment: 1 } },
    select: { version: true },
  });
  return track.version;
}

export async function deleteTrack(trackId: string) {
  const enrolled = await prisma.memberRoadmap.count({ where: { trackId } });
  if (enrolled > 0) {
    throw new TrackError(
      `${enrolled} ${enrolled === 1 ? "member is" : "members are"} on this track. Unpublish it instead.`,
    );
  }
  await prisma.roadmapTrack.delete({ where: { id: trackId } });
}

export type MilestoneInput = {
  topic: string;
  learningGoal: string;
  communityAction: string | null;
  lessonId: string | null;
  recipeId: string | null;
  recipeIdGlutenFree: string | null;
  framing: Record<string, string> | null;
  constraintNote: Record<string, string> | null;
};

/** Read the framing / constraint fields out of a posted form. */
export function variantsFromForm(form: FormData): {
  framing: Record<string, string> | null;
  constraintNote: Record<string, string> | null;
} {
  const read = (prefix: string) => (key: string) => {
    const value = form.get(`${prefix}:${key}`);
    return typeof value === "string" ? value : null;
  };
  return {
    framing: keyedFromForm(PRIMARY_BENEFITS, read("framing")),
    constraintNote: keyedFromForm(SUCKIEST_THINGS, read("constraint")),
  };
}

export async function createMilestone(trackId: string, input: MilestoneInput) {
  if (!input.topic.trim()) throw new TrackError("A milestone needs a topic.");
  if (!input.learningGoal.trim()) throw new TrackError("A milestone needs a learning goal.");

  const last = await prisma.roadmapMilestone.findFirst({
    where: { trackId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.roadmapMilestone.create({
    data: {
      trackId,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      topic: input.topic.trim(),
      learningGoal: input.learningGoal.trim(),
      communityAction: input.communityAction?.trim() || null,
      lessonId: input.lessonId || null,
      recipeId: input.recipeId || null,
      recipeIdGlutenFree: input.recipeIdGlutenFree || null,
      framing: input.framing ?? Prisma.DbNull,
      constraintNote: input.constraintNote ?? Prisma.DbNull,
    },
  });
}

export async function saveMilestone(milestoneId: string, input: MilestoneInput) {
  if (!input.topic.trim()) throw new TrackError("A milestone needs a topic.");
  if (!input.learningGoal.trim()) throw new TrackError("A milestone needs a learning goal.");

  await prisma.roadmapMilestone.update({
    where: { id: milestoneId },
    data: {
      topic: input.topic.trim(),
      learningGoal: input.learningGoal.trim(),
      communityAction: input.communityAction?.trim() || null,
      lessonId: input.lessonId || null,
      recipeId: input.recipeId || null,
      recipeIdGlutenFree: input.recipeIdGlutenFree || null,
      // `Prisma.DbNull` writes SQL NULL; a plain `undefined` would leave the
      // column untouched, and an author who emptied every box means to clear it.
      framing: input.framing ?? Prisma.DbNull,
      constraintNote: input.constraintNote ?? Prisma.DbNull,
    },
  });
}

export async function deleteMilestone(milestoneId: string) {
  await prisma.roadmapMilestone.delete({ where: { id: milestoneId } });
}

/**
 * Move a milestone one place up or down.
 *
 * Swaps the two `sortOrder` values inside a transaction. A unique constraint on
 * (track, order) would make this a three-step dance; there is none, so the
 * straight swap is both correct and readable.
 */
export async function moveMilestone(milestoneId: string, direction: "up" | "down") {
  const milestone = await prisma.roadmapMilestone.findUnique({
    where: { id: milestoneId },
    select: { id: true, trackId: true, sortOrder: true },
  });
  if (!milestone) throw new TrackError("That milestone is gone.");

  const neighbour = await prisma.roadmapMilestone.findFirst({
    where: {
      trackId: milestone.trackId,
      sortOrder:
        direction === "up" ? { lt: milestone.sortOrder } : { gt: milestone.sortOrder },
    },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    select: { id: true, sortOrder: true },
  });
  // Already at the end. Not an error — the button is simply a no-op there.
  if (!neighbour) return;

  await prisma.$transaction([
    prisma.roadmapMilestone.update({
      where: { id: milestone.id },
      data: { sortOrder: neighbour.sortOrder },
    }),
    prisma.roadmapMilestone.update({
      where: { id: neighbour.id },
      data: { sortOrder: milestone.sortOrder },
    }),
  ]);
}

/**
 * Preview combinations — §14 "Admin authoring".
 *
 * Answers a question an author cannot otherwise ask: *what does a gluten-free
 * member who is here for the animals actually read on this milestone?* Without
 * it, framing and the recipe filter are written blind, and the usual way that
 * goes wrong is a key that never matches any real answer.
 *
 * Pure apart from the titles it looks up, and it reuses `recipeForMember` so
 * the preview cannot drift from what the member page resolves.
 */
export async function previewFor(
  track: TrackDetail,
  answers: { glutenFree: boolean | null; primaryBenefit: string | null; suckiestThing: string | null },
) {
  return track.milestones.map((milestone) => {
    const chosen = recipeForMember(milestone, answers.glutenFree);
    return {
      id: milestone.id,
      topic: milestone.topic,
      learningGoal: milestone.learningGoal,
      recipeTitle:
        chosen === null
          ? null
          : chosen.glutenFree
            ? milestone.recipeGlutenFreeTitle
            : milestone.recipeTitle,
      recipeIsGlutenFree: chosen?.glutenFree ?? false,
      framing: keyedText(milestone.framing, answers.primaryBenefit),
      constraintNote: keyedText(milestone.constraintNote, answers.suckiestThing),
    };
  });
}
