import type { SearchType } from "@/lib/search";

/**
 * Where a search hit goes, and what to call it.
 *
 * One table for the results page and the command palette, so the two cannot
 * drift apart the first time a route changes. The labels use the member-facing
 * names (DEC-078, DEC-079): classes, not courses; live classes, not events.
 */
export const SEARCH_GROUPS: {
  type: SearchType;
  /** Plural label for the group heading in the palette. */
  label: string;
  /** Order the groups appear in. Members first: finding a person is the most
   *  common reason to open a community's search. */
  order: number;
}[] = [
  { type: "member", label: "Members", order: 0 },
  { type: "post", label: "Posts", order: 1 },
  { type: "course", label: "Classes", order: 2 },
  { type: "lesson", label: "Lessons", order: 3 },
  { type: "event", label: "Live classes", order: 4 },
  { type: "comment", label: "Comments", order: 5 },
];

const GROUP_BY_TYPE = new Map(SEARCH_GROUPS.map((group) => [group.type, group]));

export function searchGroupLabel(entityType: string): string {
  return GROUP_BY_TYPE.get(entityType as SearchType)?.label ?? "Results";
}

export function searchGroupOrder(entityType: string): number {
  return GROUP_BY_TYPE.get(entityType as SearchType)?.order ?? 99;
}

export function searchHref(entityType: string, entityId: string): string {
  switch (entityType) {
    case "post":
    case "comment":
      return `/posts/${entityId}`;
    case "member":
      return `/members/${entityId}`;
    // Live classes are indexed by slug, and every one has its own page.
    case "event":
      return `/live-classes/${entityId}`;
    // Classes and lessons are indexed by their address, not their id: a
    // course row holds its slug and a lesson row holds "course-slug/lesson-slug".
    case "course":
      return `/learn/${entityId}`;
    case "lesson":
      return `/learn/${entityId}`;
    default:
      return "/search";
  }
}
