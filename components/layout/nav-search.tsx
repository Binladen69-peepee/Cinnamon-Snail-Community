import { getNavSuggestions } from "@/lib/search/nav-suggestions";
import { CommandPalette } from "@/components/layout/command-palette";

/** Server wrapper so the field can suggest live classes without a client fetch. */
export async function NavSearch() {
  const suggestions = await getNavSuggestions();
  return <CommandPalette suggestions={suggestions} />;
}
