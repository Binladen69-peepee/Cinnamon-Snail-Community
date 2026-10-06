import { prisma } from "@/lib/db";

/**
 * Read-side crew queries shared outside the crews package (DEC-078).
 *
 * CONTRACT (profiles' "Show similarities" uses these; keep the signatures):
 * - `listCrewsForUser(userId)` → the member's current crews.
 * - `sharedCrews(viewerId, otherId)` → crews both belong to, for the
 *   similarities panel. Archived crews are excluded.
 */
export type CrewSummary = {
  id: string;
  slug: string;
  name: string;
  kind: "COHORT" | "ROADMAP" | "TRAIT" | "OPTIONAL";
};

export async function listCrewsForUser(userId: string): Promise<CrewSummary[]> {
  const rows = await prisma.crewMember.findMany({
    where: { userId, crew: { archivedAt: null } },
    select: { crew: { select: { id: true, slug: true, name: true, kind: true, sortOrder: true } } },
  });
  return rows
    .map((row) => row.crew)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id, slug, name, kind }) => ({ id, slug, name, kind }));
}

export async function sharedCrews(viewerId: string, otherId: string): Promise<CrewSummary[]> {
  if (viewerId === otherId) return [];
  const [mine, theirs] = await Promise.all([listCrewsForUser(viewerId), listCrewsForUser(otherId)]);
  const theirIds = new Set(theirs.map((crew) => crew.id));
  return mine.filter((crew) => theirIds.has(crew.id));
}
