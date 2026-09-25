import Link from "next/link";
import { CalendarDays, ChefHat, Hash, MapPin, Sprout, X } from "lucide-react";
import type { DirectoryData, FacetOption, MemberSort } from "@/lib/community/directory";
import { MEMBER_SORTS, groupInterestFacets } from "@/lib/community/directory";
import { cn } from "@/lib/utils";

const SORT_LABEL: Record<MemberSort, string> = {
  suggested: "Suggested",
  newest: "Newest",
  name: "A–Z",
};

type Active = DirectoryData["active"];
type ActiveKey = keyof Active;

/**
 * Filters and sort, as links.
 *
 * Doing this with links rather than client state means a narrowed directory is
 * a URL somebody can send, and the back button undoes exactly one choice.
 *
 * A facet only appears when the members themselves supply two or more distinct
 * values for it. With one value it is not a filter, it is a label — and an
 * empty filter row is worse than no filter row.
 *
 * Every chip carries its count, which is the difference between a filter you
 * trust and one you poke at: "Japanese 4" tells you whether it is worth the
 * click, and the count is real because the facets are grouped by the database
 * over the same visibility predicate the page itself uses.
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
  function href(next: Partial<Record<ActiveKey, string | null>> & { sort?: MemberSort }) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    const resolved: Record<string, string | null> = {
      location: next.location !== undefined ? next.location : active.location,
      interest: next.interest !== undefined ? next.interest : active.interest,
      skill: next.skill !== undefined ? next.skill : active.skill,
      cohort: next.cohort !== undefined ? next.cohort : active.cohort,
      space: next.space !== undefined ? next.space : active.space,
    };
    for (const [key, value] of Object.entries(resolved)) {
      if (value) search.set(key, value);
    }
    const nextSort = next.sort ?? sort;
    if (nextSort !== "suggested") search.set("sort", nextSort);
    // Any change to the filters invalidates the page number.
    const query = search.toString();
    return query ? `/members?${query}` : "/members";
  }

  const interestGroups = groupInterestFacets(facets.interests);

  type Group = {
    key: ActiveKey;
    label: string;
    icon: typeof MapPin;
    values: FacetOption[];
    current: string | null;
  };

  const groups: Group[] = ([
    {
      key: "location",
      label: "Where",
      icon: MapPin,
      values: facets.locations,
      current: active.location,
    },
    {
      key: "skill",
      label: "Level",
      icon: ChefHat,
      values: facets.skills,
      current: active.skill,
    },
    {
      key: "space",
      label: "In room",
      icon: Hash,
      values: facets.spaces,
      current: active.space,
    },
    {
      key: "cohort",
      label: "Joined",
      icon: CalendarDays,
      values: facets.cohorts,
      current: active.cohort,
    },
  ] satisfies Group[]).filter((group) => group.values.length > 1 || group.current);

  const hasFilters = Boolean(
    active.location || active.interest || active.skill || active.cohort || active.space,
  );

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="-mx-1 flex items-center gap-1 overflow-x-auto px-1" role="list">
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
            href={href({
              location: null,
              interest: null,
              skill: null,
              cohort: null,
              space: null,
            })}
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
          <FacetRow
            key={group.key}
            label={group.label}
            icon={<Icon className="size-3" aria-hidden />}
          >
            {group.values.map((option) => (
              <Chip
                key={option.value}
                href={href({
                  [group.key]: group.current === option.value ? null : option.value,
                })}
                active={group.current === option.value}
                label={option.label}
                count={option.count}
              />
            ))}
          </FacetRow>
        );
      })}

      {/* Interests get a row per kind, because "Japanese" and "Gluten free"
          answer different questions and a single row of fifty chips is one
          nobody reads to the end of. */}
      {interestGroups.map((group) => (
        <FacetRow
          key={group.kind}
          label={group.label}
          icon={<Sprout className="size-3" aria-hidden />}
        >
          {group.options.map((option) => (
            <Chip
              key={option.value}
              href={href({
                interest: active.interest === option.value ? null : option.value,
              })}
              active={active.interest === option.value}
              label={option.label}
              count={option.count}
            />
          ))}
        </FacetRow>
      ))}
    </div>
  );
}

function FacetRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ul className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
      <li className="flex shrink-0 items-center gap-1 pr-1 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
        {icon}
        {label}
      </li>
      {children}
    </ul>
  );
}

function Chip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={active ? "true" : undefined}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold no-underline transition",
          active
            ? "border-brand bg-brand-wash text-brand-strong"
            : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
        )}
      >
        {label}
        <span className="tabular-nums opacity-60">{count}</span>
      </Link>
    </li>
  );
}
