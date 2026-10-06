/**
 * Where live classes live (DEC-079).
 *
 * Events became Live Classes, and `/calendar` became `/live-classes`; the old
 * addresses redirect (next.config.ts). Every link this package writes, in a
 * page, a notification, a reminder or a calendar file, comes from here, so the
 * address cannot drift between them again.
 */

export const LIVE_CLASSES_PATH = "/live-classes";

export function liveClassHref(slug: string): string {
  return `${LIVE_CLASSES_PATH}/${slug}`;
}
