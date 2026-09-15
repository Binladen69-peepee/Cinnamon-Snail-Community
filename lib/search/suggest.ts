export type SearchSuggestion = {
  label: string;
  href: string;
  group: string;
  snippet?: string;
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
    snippet: "Upcoming classes on the calendar",
  },
  { label: "Course library", href: "/learn", group: "Sections" },
  { label: "Kitchen Table", href: "/home", group: "Sections" },
  { label: "Discover", href: "/discover", group: "Sections" },
  { label: "Members", href: "/members", group: "Sections" },
  { label: "Spaces", href: "/spaces", group: "Sections" },
  { label: "Events", href: "/calendar", group: "Sections" },
  { label: "Roadmap", href: "/roadmap", group: "Sections" },
  { label: "Bulletin Board", href: "/bulletin", group: "Sections" },
  { label: "Membership", href: "/membership", group: "Sections" },
  { label: "Courses", href: "/courses", group: "Sections" },
  { label: "Community", href: "/community", group: "Sections" },
  { label: "About", href: "/about", group: "Sections" },
  { label: "Settings", href: "/settings", group: "Sections" },
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
    const haystack = `${item.label} ${item.group} ${item.snippet ?? ""}`.toLowerCase();
    if (q && !haystack.includes(q)) continue;
    seen.add(item.href + item.label);
    ranked.push(item);
    if (ranked.length >= limit) break;
  }

  return ranked;
}
