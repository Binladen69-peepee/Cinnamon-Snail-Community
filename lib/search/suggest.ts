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
 */
export const NAV_SECTION_SUGGESTIONS: SearchSuggestion[] = [
  {
    label: "Live cook-alongs",
    href: "/calendar",
    group: "Live classes",
    detail: "Page · /calendar",
    snippet: "Upcoming classes on the calendar",
  },
  {
    label: "Course library",
    href: "/learn",
    group: "Sections",
    detail: "Section · /learn",
  },
  {
    label: "Kitchen Table",
    href: "/home",
    group: "Sections",
    detail: "Section · /home",
  },
  {
    label: "Discover",
    href: "/discover",
    group: "Sections",
    detail: "Section · /discover",
  },
  {
    label: "Members",
    href: "/members",
    group: "Sections",
    detail: "Section · /members",
  },
  {
    label: "Spaces",
    href: "/spaces",
    group: "Sections",
    detail: "Section · /spaces",
  },
  {
    label: "Events",
    href: "/calendar",
    group: "Sections",
    detail: "Section · /calendar",
  },
  {
    label: "Roadmap",
    href: "/roadmap",
    group: "Sections",
    detail: "Section · /roadmap",
  },
  {
    label: "Bulletin Board",
    href: "/bulletin",
    group: "Sections",
    detail: "Section · /bulletin",
  },
  {
    label: "Membership",
    href: "/membership",
    group: "Sections",
    detail: "Page · /membership",
  },
  {
    label: "Courses",
    href: "/courses",
    group: "Sections",
    detail: "Page · /courses",
  },
  {
    label: "Community",
    href: "/community",
    group: "Sections",
    detail: "Page · /community",
  },
  {
    label: "About",
    href: "/about",
    group: "Sections",
    detail: "Page · /about",
  },
  {
    label: "Settings",
    href: "/settings",
    group: "Sections",
    detail: "Section · /settings",
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
