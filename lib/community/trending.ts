import "server-only";
import { prisma } from "@/lib/db";

export type TrendingSpace = {
  name: string;
  slug: string;
  posts: number;
  unread: number;
};

/**
 * Spaces with the most published posts in the last two weeks.
 *
 * Counts come from the database, never invented. Unread is this member's own
 * unread in that space, so "12 new" is only shown when it is true.
 */
export async function trendingSpaces(
  userId: string,
  take = 5,
): Promise<TrendingSpace[]> {
  const since = new Date(Date.now() - 14 * 86_400_000);

  const grouped = await prisma.post.groupBy({
    by: ["spaceId"],
    where: {
      status: "PUBLISHED",
      publishedAt: { gte: since },
    },
    _count: { _all: true },
  });
  const rows = [...grouped]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, take + 4);
  if (rows.length === 0) return [];

  const [spaces, memberships] = await Promise.all([
    prisma.space.findMany({
      where: {
        id: { in: rows.map((row) => row.spaceId) },
        visibility: { in: ["PUBLIC", "MEMBERS"] },
      },
      select: { id: true, name: true, slug: true },
    }),
    prisma.spaceMembership.findMany({
      where: {
        userId,
        spaceId: { in: rows.map((row) => row.spaceId) },
      },
      select: { spaceId: true, lastReadAt: true },
    }),
  ]);
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const readAt = new Map(
    memberships.map((row) => [row.spaceId, row.lastReadAt] as const),
  );

  const unreadRows =
    memberships.length === 0
      ? []
      : await prisma.post.groupBy({
          by: ["spaceId"],
          where: {
            status: "PUBLISHED",
            authorId: { not: userId },
            spaceId: { in: memberships.map((row) => row.spaceId) },
            OR: memberships.map((row) => ({
              spaceId: row.spaceId,
              ...(row.lastReadAt ? { publishedAt: { gt: row.lastReadAt } } : {}),
            })),
          },
          _count: { _all: true },
        });
  const unread = new Map(unreadRows.map((row) => [row.spaceId, row._count._all]));

  return rows.flatMap((row) => {
    const space = byId.get(row.spaceId);
    if (!space) return [];
    return [
      {
        name: space.name,
        slug: space.slug,
        posts: row._count._all,
        unread: readAt.has(row.spaceId) ? (unread.get(row.spaceId) ?? 0) : 0,
      },
    ];
  }).slice(0, take);
}
