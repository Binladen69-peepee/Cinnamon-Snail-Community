export type SearchSuggestion = {
  label: string;
  href: string;
  group: string;
  snippet?: string;
  detail?: string;
  imageUrl?: string | null;
};

/**
 * Destinations the search field can offer before (and while) the index
 * answers. Live classes are filled in from the catalog at request time;
 * these are the standing sections of the product.
 *
 * The member sections follow the structure the client set (DEC-078): the
 * Kitchen Table is the community, there is no Explorer, no list of spaces and
 * no drafts, and events are Live Classes. The public pages at the end are for
 * the same palette on the marketing site.
 */
export const NAV_SECTION_SUGGESTIONS: SearchSuggestion[] = [
  {
    label: "Live classes",
    href: "/live-classes",
    group: "Live classes",
    detail: "Page · /live-classes",
    snippet: "Upcoming live classes, with recordings of the ones you missed",
  },
  {
    label: "Kitchen Table",
    href: "/kitchen-table",
    group: "Sections",
    detail: "Community · /kitchen-table",
    snippet: "The community feed",
  },
  {
    label: "Bulletin Board",
    href: "/bulletin",
    group: "Sections",
    detail: "Community · /bulletin",
  },
  {
    label: "Members",
    href: "/members",
    group: "Sections",
    detail: "Community · /members",
  },
  {
    label: "Connect",
    href: "/connect",
    group: "Sections",
    detail: "Community · /connect",
  },
  {
    label: "Messages",
    href: "/messages",
    group: "Sections",
    detail: "Community · /messages",
  },
  {
    label: "Ideas & Requests",
    href: "/ideas",
    group: "Sections",
    detail: "Section · /ideas",
    snippet: "Ask for the classes, recipes and features you want next",
  },
  {
    label: "Crews",
    href: "/crews",
    group: "Sections",
    detail: "Section · /crews",
  },
  {
    label: "Class library",
    href: "/learn",
    group: "Sections",
    detail: "Section · /learn",
  },
  {
    label: "Roadmap",
    href: "/roadmap",
    group: "Sections",
    detail: "Section · /roadmap",
  },
  {
    label: "Settings",
    href: "/settings",
    group: "Sections",
    detail: "Section · /settings",
  },
  {
    label: "Membership",
    href: "/membership",
    group: "Pages",
    detail: "Page · /membership",
  },
  {
    label: "Courses",
    href: "/courses",
    group: "Pages",
    detail: "Page · /courses",
  },
  {
    label: "Community",
    href: "/community",
    group: "Pages",
    detail: "Page · /community",
  },
  {
    label: "About",
    href: "/about",
    group: "Pages",
    detail: "Page · /about",
  },
];

export function filterSuggestions(
  items: SearchSuggestion[],
  query: string,
  limit = 8,
): SearchSuggestion[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const ranked: SearchSuggestion[] = [];

  for (const item of items) {
    if (seen.has(item.href + item.label)) continue;
    const haystack =
      `${item.label} ${item.group} ${item.snippet ?? ""} ${item.detail ?? ""}`.toLowerCase();
    if (q && !haystack.includes(q)) continue;
    seen.add(item.href + item.label);
    ranked.push(item);
    if (ranked.length >= limit) break;
  }

  return ranked;
}
