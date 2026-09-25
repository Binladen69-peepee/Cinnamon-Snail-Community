import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * Who a viewer is allowed to be shown, anywhere.
 *
 * The directory has always honoured `directoryVisible` and blocks. Nothing
 * else did. `searchEntities` takes no viewer at all, so a member who switched
 * themselves out of the directory was still returned by global search and by
 * the command palette — under their real name, linking to their profile. The
 * switch said "hide me from the directory" and the member reasonably read it
 * as "hide me".
 *
 * So the rule moves here, and every surface that can name a member filters
 * through it: search, the palette, Discover and the directory. A rule enforced
 * in four places is a rule; enforced in one of four it is a suggestion.
 *
 * Staff are not exempt from the hiding, only from the blocking — a member who
 * blocked an admin has not thereby hidden themselves from moderation, but an
 * admin browsing the directory has no business seeing somebody who opted out
 * of it either.
 */

export type MemberVisibility = {
  /** Handles the viewer must never be shown by name. */
  hiddenHandles: Set<string>;
  /** User ids, for the same set. */
  hiddenIds: Set<string>;
};

/**
 * Memoised for the request: search, the palette and the page header can all
 * ask, and the answer cannot change between them.
 *
 * Bounded deliberately. At community scale this is a small set — the people
 * who opted out plus the people either of you blocked — and it is far cheaper
 * to fetch once than to join against on every query. If that set ever grows
 * past the cap the query below becomes a join instead; the cap is here so the
 * failure is a missing exclusion rather than a request that loads a table.
 */
export const getMemberVisibility = cache(async function getMemberVisibility(
  viewerId: string,
): Promise<MemberVisibility> {
  const [hidden, blocks] = await Promise.all([
    prisma.profile.findMany({
      where: {
        OR: [{ directoryVisible: false }, { user: { status: { not: "ACTIVE" } } }],
      },
      select: { userId: true, user: { select: { handle: true } } },
      take: 5000,
    }),
    prisma.userBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: {
        blocker: { select: { id: true, handle: true } },
        blocked: { select: { id: true, handle: true } },
      },
    }),
  ]);

  const hiddenHandles = new Set<string>();
  const hiddenIds = new Set<string>();

  for (const row of hidden) {
    // A member is never hidden from themselves.
    if (row.userId === viewerId) continue;
    hiddenIds.add(row.userId);
    hiddenHandles.add(row.user.handle);
  }
  for (const block of blocks) {
    for (const side of [block.blocker, block.blocked]) {
      if (side.id === viewerId) continue;
      hiddenIds.add(side.id);
      hiddenHandles.add(side.handle);
    }
  }

  return { hiddenHandles, hiddenIds };
});

/**
 * Drop member rows the viewer may not see.
 *
 * Written against the search index's shape, where a member row is keyed by
 * handle. Rows of any other type pass through untouched.
 */
export function filterHiddenMembers<
  T extends { entityType: string; entityId: string },
>(rows: readonly T[], visibility: MemberVisibility): T[] {
  if (visibility.hiddenHandles.size === 0) return [...rows];
  return rows.filter(
    (row) =>
      row.entityType !== "member" || !visibility.hiddenHandles.has(row.entityId),
  );
}
