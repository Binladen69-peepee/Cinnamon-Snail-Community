/**
 * Ideas & Requests: the vocabulary (DEC-078).
 *
 * Client-safe on purpose. The form, the badges and the filters render in the
 * browser as well as on the server, so nothing here imports the database, and
 * the values are plain string unions rather than Prisma's enums (which are the
 * same strings, so the two are assignable both ways).
 */

export const IDEAS_TITLE = "Ideas & Requests";
export const IDEAS_DESCRIPTION =
  "Ask for the classes, recipes and features you want next, and upvote the ones you want most.";

export const IDEA_CATEGORY_VALUES = ["CLASS", "RECIPE", "FEATURE", "OTHER"] as const;
export type IdeaCategoryValue = (typeof IDEA_CATEGORY_VALUES)[number];

export const IDEA_STATUS_VALUES = [
  "OPEN",
  "UNDER_REVIEW",
  "PLANNED",
  "DONE",
  "DECLINED",
] as const;
export type IdeaStatusValue = (typeof IDEA_STATUS_VALUES)[number];

export const IDEA_CATEGORIES: Record<
  IdeaCategoryValue,
  { label: string; hint: string; slug: string }
> = {
  CLASS: { label: "Class", hint: "A class or a technique you want taught", slug: "class" },
  RECIPE: { label: "Recipe", hint: "A dish you want a recipe for", slug: "recipe" },
  FEATURE: { label: "Feature", hint: "Something the app should do", slug: "feature" },
  OTHER: { label: "Other", hint: "Anything else", slug: "other" },
};

export const IDEA_STATUSES: Record<
  IdeaStatusValue,
  { label: string; description: string; slug: string }
> = {
  OPEN: { label: "Open", description: "Collecting votes.", slug: "open" },
  UNDER_REVIEW: {
    label: "Under review",
    description: "The team is looking at it.",
    slug: "under-review",
  },
  PLANNED: { label: "Planned", description: "It is on the way.", slug: "planned" },
  DONE: { label: "Done", description: "It is here.", slug: "done" },
  DECLINED: {
    label: "Declined",
    description: "Not something the team will take on.",
    slug: "declined",
  },
};

/**
 * Statuses whose count is final. A shipped idea has nothing left to vote for,
 * and votes piling up on a declined one would read as a promise.
 */
export const VOTING_CLOSED_STATUSES: readonly IdeaStatusValue[] = ["DONE", "DECLINED"];

/** What a member may write. Enforced on the server; mirrored in the form. */
export const IDEA_TITLE_MIN = 6;
export const IDEA_TITLE_MAX = 120;
export const IDEA_BODY_MAX = 5000;
export const IDEA_NOTE_MAX = 500;

/** Rows per page on the board and in the console. */
export const IDEAS_PAGE_SIZE = 20;

export function isIdeaCategory(value: unknown): value is IdeaCategoryValue {
  return typeof value === "string" && (IDEA_CATEGORY_VALUES as readonly string[]).includes(value);
}

export function isIdeaStatus(value: unknown): value is IdeaStatusValue {
  return typeof value === "string" && (IDEA_STATUS_VALUES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------------ */
/* The board's views, as they appear in the URL                             */
/* ------------------------------------------------------------------------ */

export type IdeaSort = "top" | "new" | "planned";

export const IDEA_SORTS: { value: IdeaSort; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "new", label: "New" },
  { value: "planned", label: "Planned" },
];

/**
 * Which statuses a list shows. "active" is the default: what is still in play
 * (open, under review, planned). Shipped and declined ideas are one chip away
 * rather than crowding the top of the board for ever.
 */
export type IdeaStatusFilter = "active" | "all" | IdeaStatusValue;

export const IDEA_STATUS_FILTERS: { value: IdeaStatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "OPEN", label: IDEA_STATUSES.OPEN.label },
  { value: "UNDER_REVIEW", label: IDEA_STATUSES.UNDER_REVIEW.label },
  { value: "PLANNED", label: IDEA_STATUSES.PLANNED.label },
  { value: "DONE", label: IDEA_STATUSES.DONE.label },
  { value: "DECLINED", label: IDEA_STATUSES.DECLINED.label },
  { value: "all", label: "Everything" },
];

const ACTIVE_STATUSES: IdeaStatusValue[] = ["OPEN", "UNDER_REVIEW", "PLANNED"];

/** The statuses a filter admits; null means every status. */
export function statusesForFilter(filter: IdeaStatusFilter): IdeaStatusValue[] | null {
  if (filter === "all") return null;
  if (filter === "active") return ACTIVE_STATUSES;
  return [filter];
}

const first = (value: string | string[] | undefined | null) =>
  Array.isArray(value) ? value[0] : (value ?? undefined);

export function parseIdeaSort(value: string | string[] | undefined | null): IdeaSort {
  const raw = first(value);
  return raw === "new" || raw === "planned" ? raw : "top";
}

export function parseIdeaCategory(
  value: string | string[] | undefined | null,
): IdeaCategoryValue | null {
  const raw = first(value)?.toLowerCase();
  if (!raw) return null;
  const match = IDEA_CATEGORY_VALUES.find((key) => IDEA_CATEGORIES[key].slug === raw);
  return match ?? null;
}

export function parseIdeaStatusFilter(
  value: string | string[] | undefined | null,
): IdeaStatusFilter {
  const raw = first(value)?.toLowerCase();
  if (!raw) return "active";
  if (raw === "all") return "all";
  const match = IDEA_STATUS_VALUES.find((key) => IDEA_STATUSES[key].slug === raw);
  return match ?? "active";
}

export function parsePage(value: string | string[] | undefined | null): number {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 1 ? Math.min(parsed, 500) : 1;
}

/**
 * The board's address for a view. Defaults are left out, so the plain
 * `/ideas` is the canonical front page and a shared link stays short.
 */
export function ideasHref(view: {
  sort?: IdeaSort;
  category?: IdeaCategoryValue | null;
  status?: IdeaStatusFilter;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (view.sort && view.sort !== "top") params.set("sort", view.sort);
  if (view.category) params.set("category", IDEA_CATEGORIES[view.category].slug);
  if (view.status && view.status !== "active") {
    params.set("status", view.status === "all" ? "all" : IDEA_STATUSES[view.status].slug);
  }
  if (view.page && view.page > 1) params.set("page", String(view.page));
  const query = params.toString();
  return query ? `/ideas?${query}` : "/ideas";
}

/* ------------------------------------------------------------------------ */
/* The console's views                                                      */
/* ------------------------------------------------------------------------ */

/**
 * What staff can narrow the console to. Merged and removed ideas are never on
 * the member board, so they are only reachable from here.
 */
export type AdminIdeaFilter =
  | "open"
  | "under-review"
  | "planned"
  | "done"
  | "declined"
  | "merged"
  | "removed"
  | "all";

export const ADMIN_IDEA_FILTERS: { value: AdminIdeaFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "under-review", label: "Under review" },
  { value: "planned", label: "Planned" },
  { value: "done", label: "Done" },
  { value: "declined", label: "Declined" },
  { value: "merged", label: "Merged" },
  { value: "removed", label: "Removed" },
  { value: "all", label: "Everything" },
];

export function parseAdminIdeaFilter(
  value: string | string[] | undefined | null,
): AdminIdeaFilter {
  const raw = first(value);
  return ADMIN_IDEA_FILTERS.some((item) => item.value === raw)
    ? (raw as AdminIdeaFilter)
    : "open";
}

export type AdminIdeaSort = "votes" | "new";

export function parseAdminIdeaSort(value: string | string[] | undefined | null): AdminIdeaSort {
  return first(value) === "new" ? "new" : "votes";
}

export function adminIdeasHref(view: {
  filter?: AdminIdeaFilter;
  sort?: AdminIdeaSort;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (view.filter && view.filter !== "open") params.set("filter", view.filter);
  if (view.sort && view.sort !== "votes") params.set("sort", view.sort);
  if (view.page && view.page > 1) params.set("page", String(view.page));
  const query = params.toString();
  return query ? `/admin/ideas?${query}` : "/admin/ideas";
}
