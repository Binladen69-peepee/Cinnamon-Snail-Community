import Link from "next/link";
import { ChefHat, MapPin, Sprout, X } from "lucide-react";
import type { DirectoryData, MemberSort } from "@/lib/community/directory";
import { MEMBER_SORTS } from "@/lib/community/directory";
import { cn } from "@/lib/utils";

const SORT_LABEL: Record<MemberSort, string> = {
  suggested: "Suggested",
  newest: "Newest",
  name: "A–Z",
};

type Active = DirectoryData["active"];

/**
 * Filters and sort, as links.
 *
 * The research on directories says the same thing the rest of this app already
 * does: let people narrow without losing their place. Doing that with links
 * rather than client state means a narrowed directory is a URL you can send to
 * someone, and the back button undoes exactly one choice.
 *
 * A facet only appears when the members themselves supply two or more distinct
 * values for it. With one value it is not a filter, it is a label — and an
 * empty filter row is worse than no filter row.
 */
export function MemberFilters({
  facets,
  active,
  sort,
  q,
}: {
  facets: DirectoryData["facets"];
  active: Active;
  sort: MemberSort;
  q: string;
}) {
  function href(next: Partial<Active> & { sort?: MemberSort }) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const location = next.location !== undefined ? next.location : active.location;
    const interest = next.interest !== undefined ? next.interest : active.interest;
    const skill = next.skill !== undefined ? next.skill : active.skill;
    const nextSort = next.sort ?? sort;
    if (location) search.set("location", location);
    if (interest) search.set("interest", interest);
    if (skill) search.set("skill", skill);
    if (nextSort !== "suggested") search.set("sort", nextSort);
    // Any change to the filters invalidates the page number.
    const query = search.toString();
    return query ? `/members?${query}` : "/members";
  }

  const groups = [
    {
      key: "location" as const,
      label: "Where",
      icon: MapPin,
      values: facets.locations,
      current: active.location,
    },
    {
      key: "interest" as const,
      label: "Cooks",
      icon: Sprout,
      values: facets.interests,
      current: active.interest,
    },
    {
      key: "skill" as const,
      label: "Level",
      icon: ChefHat,
      values: facets.skillLevels,
      current: active.skill,
    },
  ].filter((group) => group.values.length > 1 || group.current);

  const hasFilters = Boolean(active.location || active.interest || active.skill);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex items-center gap-1" role="list">
          <li className="mr-1 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
            Sort
          </li>
          {MEMBER_SORTS.map((option) => (
            <li key={option}>
              <Link
                href={href({ sort: option })}
                scroll={false}
                aria-current={option === sort ? "true" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-semibold no-underline transition",
                  option === sort
                    ? "border-brand-fill bg-brand-fill text-brand-fill-foreground"
                    : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
                )}
              >
                {SORT_LABEL[option]}
              </Link>
            </li>
          ))}
        </ul>

        {hasFilters ? (
          <Link
            href={href({ location: null, interest: null, skill: null })}
            scroll={false}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand no-underline hover:underline"
          >
            <X className="size-3.5" aria-hidden />
            Clear filters
          </Link>
        ) : null}
      </div>

      {groups.map((group) => {
        const Icon = group.icon;
        return (
          <ul
            key={group.key}
            className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            <li className="flex shrink-0 items-center gap-1 pr-1 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              <Icon className="size-3" aria-hidden />
              {group.label}
            </li>
            {group.values.map((value) => {
              const current = group.current === value;
              return (
                <li key={value}>
                  <Link
                    href={href({ [group.key]: current ? null : value } as Partial<Active>)}
                    scroll={false}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold capitalize no-underline transition",
                      current
                        ? "border-brand bg-brand-wash text-brand-strong"
                        : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
                    )}
                  >
                    {value}
                  </Link>
                </li>
              );
            })}
          </ul>
        );
      })}
    </div>
  );
}
