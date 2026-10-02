import "server-only";
import { prisma } from "@/lib/db";
import { parseScheduleConfig, PROMPT_TYPE_LABEL, type PromptType } from "@/lib/ai/types";
import { cohostConfigured } from "@/lib/ai/generate";
import { draftText, pollOptionsOf } from "@/lib/ai/drafts";

/** What the cohost console shows. One read per panel. */

export type QueueDraft = {
  id: string;
  text: string;
  original: string;
  edited: boolean;
  promptType: string;
  typeLabel: string;
  status: string;
  rationale: string | null;
  pollOptions: string[];
  findings: { code: string; detail: string }[];
  similarity: number | null;
  scheduleName: string;
  snoozedUntil: Date | null;
  publishAt: Date | null;
  publishedPostId: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  /** For a published prompt: did the room answer it? */
  engagement: { comments: number; reactions: number } | null;
};

export type ScheduleRow = {
  id: string;
  name: string;
  spaceName: string | null;
  authorHandle: string | null;
  paused: boolean;
  autoPauseReason: string | null;
  timezone: string;
  days: number[];
  defaultTime: string;
  draftCount: number;
  pending: number;
  lastGeneratedAt: Date | null;
};

export type CohostConsole = {
  configured: boolean;
  schedules: ScheduleRow[];
  queue: QueueDraft[];
  recent: QueueDraft[];
  counts: { pending: number; approved: number; published: number; rejected: number };
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const dayName = (day: number) => DAY_NAMES[day] ?? String(day);

function toDraft(row: {
  id: string;
  body: string;
  editedBody: string | null;
  promptType: string;
  status: string;
  guardrail: unknown;
  generation: unknown;
  snoozedUntil: Date | null;
  publishAt: Date | null;
  publishedPostId: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  schedule: { name: string };
}): QueueDraft {
  const guardrail = (row.guardrail ?? {}) as { findings?: { code: string; detail: string }[]; similarity?: number };
  const generation = (row.generation ?? {}) as { rationale?: string };
  return {
    id: row.id,
    text: draftText(row),
    original: row.body,
    edited: Boolean(row.editedBody && row.editedBody !== row.body),
    promptType: row.promptType,
    typeLabel: PROMPT_TYPE_LABEL[row.promptType as PromptType] ?? row.promptType,
    status: row.status,
    rationale: generation.rationale ?? null,
    pollOptions: pollOptionsOf(row.generation),
    findings: guardrail.findings ?? [],
    similarity: typeof guardrail.similarity === "number" ? guardrail.similarity : null,
    scheduleName: row.schedule.name,
    snoozedUntil: row.snoozedUntil,
    publishAt: row.publishAt,
    publishedPostId: row.publishedPostId,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
    engagement: null,
  };
}

const SELECT = {
  id: true,
  body: true,
  editedBody: true,
  promptType: true,
  status: true,
  guardrail: true,
  generation: true,
  snoozedUntil: true,
  publishAt: true,
  publishedPostId: true,
  rejectionReason: true,
  createdAt: true,
  schedule: { select: { name: true } },
} as const;

export async function loadCohostConsole(): Promise<CohostConsole> {
  const [schedules, queue, recent, grouped] = await Promise.all([
    prisma.aiPromptSchedule.findMany({ orderBy: { name: "asc" } }),
    prisma.aiPromptDraft.findMany({
      where: { status: { in: ["pending", "snoozed", "approved"] } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 50,
      select: SELECT,
    }),
    prisma.aiPromptDraft.findMany({
      where: { status: { in: ["published", "rejected", "failed"] } },
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: SELECT,
    }),
    prisma.aiPromptDraft.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const spaceIds = schedules.map((row) => row.spaceId).filter((id): id is string => Boolean(id));
  const authorIds = schedules.map((row) => row.authorUserId).filter((id): id is string => Boolean(id));
  const [spaces, authors, pendingCounts] = await Promise.all([
    spaceIds.length
      ? prisma.space.findMany({ where: { id: { in: spaceIds } }, select: { id: true, name: true } })
      : [],
    authorIds.length
      ? prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, handle: true } })
      : [],
    prisma.aiPromptDraft.groupBy({
      by: ["scheduleId"],
      where: { status: "pending" },
      _count: { _all: true },
    }),
  ]);
  // Analytics: what the published prompts actually got. One query for all of
  // them — the whole point of a cohost is whether the room answers it.
  const publishedIds = recent
    .map((row) => row.publishedPostId)
    .filter((id): id is string => Boolean(id));
  const posts = publishedIds.length
    ? await prisma.post.findMany({
        where: { id: { in: publishedIds } },
        select: { id: true, commentCount: true, _count: { select: { reactions: true } } },
      })
    : [];
  const postById = new Map(posts.map((post) => [post.id, post]));

  const spaceById = new Map(spaces.map((space) => [space.id, space.name]));
  const authorById = new Map(authors.map((user) => [user.id, user.handle]));
  const pendingBySchedule = new Map(pendingCounts.map((row) => [row.scheduleId, row._count._all]));
  const count = (status: string) => grouped.find((row) => row.status === status)?._count._all ?? 0;

  return {
    configured: cohostConfigured(),
    counts: {
      pending: count("pending"),
      approved: count("approved"),
      published: count("published"),
      rejected: count("rejected"),
    },
    schedules: schedules.map((row): ScheduleRow => {
      const config = parseScheduleConfig(row.config);
      return {
        id: row.id,
        name: row.name,
        spaceName: row.spaceId ? (spaceById.get(row.spaceId) ?? null) : null,
        authorHandle: row.authorUserId ? (authorById.get(row.authorUserId) ?? null) : null,
        paused: row.paused,
        autoPauseReason: row.autoPauseReason,
        timezone: row.timezone,
        days: config.days,
        defaultTime: config.defaultTime,
        draftCount: config.draftCount,
        pending: pendingBySchedule.get(row.id) ?? 0,
        lastGeneratedAt: row.lastGeneratedAt,
      };
    }),
    queue: queue.map(toDraft),
    recent: recent.map((row) => {
      const draft = toDraft(row);
      const post = row.publishedPostId ? postById.get(row.publishedPostId) : undefined;
      return post
        ? { ...draft, engagement: { comments: post.commentCount, reactions: post._count.reactions } }
        : draft;
    }),
  };
}
