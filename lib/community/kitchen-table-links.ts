/**
 * Addresses inside the Kitchen Table, for client and server code alike.
 *
 * `KITCHEN_TABLE_PATH` in `system-spaces.ts` is the canonical value, but that
 * module talks to the database, and a client component that imported it
 * would drag Prisma into the browser bundle. This mirrors it with no imports
 * at all; a test holds the two equal.
 */

export const KITCHEN_TABLE_HREF = "/kitchen-table";

export type KitchenTableView = "feed" | "reels";

/** The Kitchen Table for a view and a sort, with the defaults left out of the URL. */
export function kitchenTableHref(
  options: { view?: KitchenTableView; sort?: string | null } = {},
): string {
  const params = new URLSearchParams();
  if (options.view === "reels") params.set("view", "reels");
  if (options.sort && options.sort !== "active") params.set("sort", options.sort);
  const query = params.toString();
  return query ? `${KITCHEN_TABLE_HREF}?${query}` : KITCHEN_TABLE_HREF;
}
