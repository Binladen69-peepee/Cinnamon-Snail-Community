import "server-only";
import { prisma } from "@/lib/db";
import { statusOf, type ChallengeStatus } from "@/lib/challenges";

/** What the challenge console shows. One read, no N+1. */

export type AdminChallenge = {
  id: string;
  slug: string;
  title: string;
  theme: string | null;
  startsAt: Date;
  endsAt: Date;
  target: string | null;
  targetCount: number;
  published: boolean;
  status: ChallengeStatus;
  spaceName: string | null;
  badgeSlug: string | null;
  kitTag: string | null;
  promptCount: number;
  joined: number;
  finished: number;
  prompts: { id: string; day: number; title: string; body: string }[];
};

export async function loadAdminChallenges(now = new Date()): Promise<AdminChallenge[]> {
  const rows = await prisma.challenge.findMany({
    orderBy: { startsAt: "desc" },
    include: {
      prompts: { orderBy: { day: "asc" }, select: { id: true, day: true, title: true, body: true } },
      _count: { select: { participants: true } },
    },
  });

  const spaceIds = rows.map((row) => row.spaceId).filter((id): id is string => Boolean(id));
  const [spaces, finished] = await Promise.all([
    spaceIds.length
      ? prisma.space.findMany({ where: { id: { in: spaceIds } }, select: { id: true, name: true } })
      : [],
    prisma.challengeParticipant.groupBy({
      by: ["challengeId"],
      where: { completedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const spaceById = new Map(spaces.map((space) => [space.id, space.name]));
  const finishedBy = new Map(finished.map((row) => [row.challengeId, row._count._all]));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    theme: row.theme,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    target: row.target,
    targetCount: row.targetCount,
    published: row.published,
    status: statusOf(row, now),
    spaceName: row.spaceId ? (spaceById.get(row.spaceId) ?? null) : null,
    badgeSlug: row.badgeSlug,
    kitTag: row.kitTag,
    promptCount: row.prompts.length,
    joined: row._count.participants,
    finished: finishedBy.get(row.id) ?? 0,
    prompts: row.prompts,
  }));
}
