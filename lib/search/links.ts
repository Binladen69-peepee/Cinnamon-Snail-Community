import type { SearchType } from "@/lib/search";

/**
 * Where a search hit goes, and what to call it.
 *
 * The search page had this mapping inlined as a nested ternary, so the command
 * palette would have had to repeat it and the two would have drifted the first
 * time a route changed. One table, both callers.
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
  { type: "course", label: "Courses", order: 2 },
  { type: "lesson", label: "Lessons", order: 3 },
  { type: "event", label: "Events", order: 4 },
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
    case "event":
      return "/calendar";
    case "course":
      return `/learn/${entityId}`;
    case "lesson":
      return "/learn";
    default:
      return "/search";
  }
}
