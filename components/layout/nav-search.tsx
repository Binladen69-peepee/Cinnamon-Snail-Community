import { getNavSuggestions } from "@/lib/search/nav-suggestions";
import { withMemberDestinations } from "@/lib/navigation";
import { CommandPalette } from "@/components/layout/command-palette";

/**
 * Server wrapper so the field can suggest live classes without a client fetch.
 *
 * The catalog rows (the next live class, the classes) come from the search
 * library; the standing destinations come from the member menu, so the
 * palette offers the same places the rail does — Kitchen Table, Live Classes,
 * Ideas & Requests — rather than the retired Explorer, Spaces and Events.
 */
export async function NavSearch() {
  const suggestions = await getNavSuggestions();
  return <CommandPalette suggestions={withMemberDestinations(suggestions)} />;
}
