import Link from "next/link";
import { CalendarDays, ChefHat, Hash, MapPin, Sprout, X } from "lucide-react";
import type { DirectoryData, FacetOption, MemberSort } from "@/lib/community/directory";
import { MEMBER_SORTS, groupInterestFacets } from "@/lib/community/directory";
import {
  ButtonLink,
  ChipRow,
  Segmented,
  chipClass,
  segmentClass,
} from "@/components/app/ui";

const SORT_LABEL: Record<MemberSort, string> = {
  suggested: "Suggested",
  newest: "Newest",
  name: "A–Z",
};

type Active = DirectoryData["active"];
type ActiveKey = keyof Active;

/** The small label at the start of a row: "Sort", "Where", "Level". */
const ROW_LABEL =
  "inline-flex shrink-0 items-center gap-1 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted [&_svg]:size-3";

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
 *
 * Sort is a segmented control, because it is one choice of three; the facets
 * are chips, because each row is a set of independent narrowings. Both mark
 * the chosen item the same way the rest of the app does.
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={ROW_LABEL} aria-hidden>
            Sort
          </span>
          <Segmented label="Sort">
            {MEMBER_SORTS.map((option) => (
              <Link
                key={option}
                href={href({ sort: option })}
                scroll={false}
                aria-current={option === sort ? "true" : undefined}
                className={segmentClass(option === sort)}
              >
                {SORT_LABEL[option]}
              </Link>
            ))}
          </Segmented>
        </div>

        {hasFilters ? (
          <ButtonLink
            href={href({
              location: null,
              interest: null,
              skill: null,
              cohort: null,
              space: null,
            })}
            scroll={false}
            variant="ghost"
            size="sm"
          >
            <X className="size-4" aria-hidden />
            Clear filters
          </ButtonLink>
        ) : null}
      </div>

      {groups.map((group) => {
        const Icon = group.icon;
        return (
          <FacetRow key={group.key} label={group.label} icon={<Icon aria-hidden />}>
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
        <FacetRow key={group.kind} label={group.label} icon={<Sprout aria-hidden />}>
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

/**
 * One facet: its label, then its chips. Scrolls sideways on a phone and wraps
 * from `sm` up, where there is room to see every option at once.
 */
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
    <ChipRow label={label} className="sm:flex-wrap">
      <span className={`${ROW_LABEL} pr-1`} aria-hidden>
        {icon}
        {label}
      </span>
      {children}
    </ChipRow>
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
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={chipClass(active)}
    >
      {label}
      <span className="font-normal tabular-nums">{count}</span>
    </Link>
  );
}
