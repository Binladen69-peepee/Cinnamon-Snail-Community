/**
 * The sections of a profile, shared by the page (which reads `?tab=`) and the
 * view (which writes it back as the member switches), so a link such as an
 * activity row's "Earned a badge" can open the profile on the right tab.
 */
export const PROFILE_TABS = [
  ["posts", "Posts"],
  ["activity", "Activity"],
  ["badges", "Badges"],
  ["classes", "Classes"],
  ["about", "About"],
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number][0];

const TAB_IDS = new Set<string>(PROFILE_TABS.map(([id]) => id));

export function parseProfileTab(value: string | string[] | undefined): ProfileTab {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim().toLowerCase() ?? "";
  return TAB_IDS.has(raw) ? (raw as ProfileTab) : "posts";
}
