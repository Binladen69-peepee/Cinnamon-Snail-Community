import { prisma } from "@/lib/db";

export async function upsertSearchIndex(input: {
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  spaceId?: string | null;
}) {
  return prisma.searchIndex.upsert({
    where: {
      entityType_entityId: {
        entityType: input.entityType,
        entityId: input.entityId,
      },
    },
    update: {
      title: input.title,
      body: input.body,
      spaceId: input.spaceId ?? null,
    },
    create: {
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      body: input.body,
      spaceId: input.spaceId ?? null,
    },
  });
}

export type SearchType =
  | "post"
  | "comment"
  | "course"
  | "lesson"
  | "event"
  | "member";

function escapeLike(value: string) {
  return value.replace(/[%_]/g, "\\$&");
}

export async function searchEntities(input: {
  query: string;
  types?: SearchType[];
  spaceId?: string;
  limit?: number;
}) {
  const q = input.query.trim();
  if (q.length < 2) return [];
  const types = input.types;
  const limit = input.limit ?? 20;

  try {
    const rows = await prisma.$queryRawUnsafe<
      {
        id: string;
        entityType: string;
        entityId: string;
        title: string;
        body: string;
        rank: number;
      }[]
    >(
      `
      SELECT id, "entityType", "entityId", title, body,
        ts_rank(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')), plainto_tsquery('english', $1)) AS rank
      FROM "SearchIndex"
      WHERE to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')) @@ plainto_tsquery('english', $1)
        ${types?.length ? `AND "entityType" = ANY($2)` : ""}
        ${input.spaceId ? `AND "spaceId" = ${types?.length ? "$3" : "$2"}` : ""}
      ORDER BY rank DESC
      LIMIT ${limit}
      `,
      q,
      ...(types?.length ? [types] : []),
      ...(input.spaceId ? [input.spaceId] : []),
    );
    if (rows.length > 0) return rows;
  } catch {
    // Fall through to trigram/ilike if FTS isn't available yet.
  }

  return prisma.searchIndex.findMany({
    where: {
      AND: [
        types?.length ? { entityType: { in: types } } : {},
        input.spaceId ? { spaceId: input.spaceId } : {},
        {
          OR: [
            { title: { contains: escapeLike(q), mode: "insensitive" } },
            { body: { contains: escapeLike(q), mode: "insensitive" } },
          ],
        },
      ],
    },
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
}
