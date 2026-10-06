import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  FileText,
  GraduationCap,
  MessageCircle,
  Search as SearchIcon,
  SearchX,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SEARCH_GROUPS } from "@/lib/search/links";
import type { SearchType } from "@/lib/search";
import {
  groupHits,
  isSearchType,
  searchForViewer,
  type ResultHit,
} from "@/lib/search/results";
import { AppShell } from "@/components/app/app-shell";
import { UrlSearchField } from "@/components/app/url-search-field";
import { Avatar } from "@/components/ui/avatar";
import {
  ButtonLink,
  EmptyState,
  ErrorState,
  PageHeader,
  cardClass,
  chipClass,
} from "@/components/app/ui";

export const metadata = { title: "Search" };

const TYPE_ICON: Record<SearchType, LucideIcon> = {
  member: UserRound,
  post: FileText,
  course: BookOpen,
  lesson: GraduationCap,
  event: CalendarDays,
  comment: MessageCircle,
};

/** How many of each kind the mixed view shows before offering the rest. */
const PER_GROUP = 5;
/** How many a single-kind view shows. */
const PER_TYPE = 40;

/**
 * Search results, behind the command palette.
 *
 * The palette shows four of a kind and is gone the moment focus leaves it;
 * pressing Enter lands here, where the same query has room, can be narrowed to
 * one kind, and is a URL someone can send. Both read through
 * `searchForViewer`, so neither can show a post from a room the viewer may not
 * enter or a member who has hidden themselves.
 *
 * The query and the kind live in the URL and the page renders on the server,
 * so it works with JavaScript off and survives a reload.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/search");

  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 120);
  const type = isSearchType(params.type) ? params.type : null;

  let hits: ResultHit[] = [];
  let failed = false;
  if (q.length >= 2) {
    try {
      hits = await searchForViewer({
        viewerId: session.user.id,
        query: q,
        type,
        limit: type ? PER_TYPE : 60,
      });
    } catch (error) {
      console.error("[search] results failed", error);
      failed = true;
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Search"
          description="Members, posts, classes, lessons and live classes, in one place."
        >
          <div className="flex flex-col gap-3">
            <UrlSearchField placeholder="Search Vegan University" label="Search everything" />
            <TypeFilter q={q} active={type} />
          </div>
        </PageHeader>

        {q.length < 2 ? (
          <EmptyState
            icon={<SearchIcon />}
            title={q ? "Keep typing" : "What are you looking for?"}
            description={
              q
                ? "Search needs at least two characters."
                : "Try a member’s name, an ingredient, a class or a technique."
            }
          />
        ) : failed ? (
          <ErrorState
            title="Search didn’t answer"
            description="Something went wrong on our side. Try again in a moment."
            action={
              <ButtonLink href={searchUrl(q, type)} variant="primary">
                Try again
              </ButtonLink>
            }
          />
        ) : hits.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title={`Nothing matches “${q}”`}
            description={
              type
                ? "Nothing of this kind matches. Other kinds might."
                : "Try a shorter word or a different spelling. Posts you cannot open are never searched."
            }
            action={
              type ? (
                <ButtonLink href={searchUrl(q, null)}>Search everything</ButtonLink>
              ) : undefined
            }
          />
        ) : type ? (
          <section aria-label={`${labelFor(type)} matching ${q}`} className="flex flex-col gap-3">
            <p className="text-caption font-medium tabular-nums text-foreground-muted">
              {hits.length >= PER_TYPE ? `The first ${PER_TYPE}` : hits.length}{" "}
              {hits.length === 1 ? "result" : "results"}
            </p>
            <HitList hits={hits} />
          </section>
        ) : (
          <div className="flex flex-col gap-8">
            {groupHits(hits, PER_GROUP).map((group) => {
              const total = hits.filter((hit) => hit.type === group.type).length;
              return (
                <section
                  key={group.type}
                  aria-labelledby={`search-${group.type}`}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-end justify-between gap-3">
                    <h2
                      id={`search-${group.type}`}
                      className="text-title font-semibold text-foreground"
                    >
                      {group.label}
                    </h2>
                    {total > PER_GROUP ? (
                      <Link
                        href={searchUrl(q, group.type)}
                        className="rounded-chip text-label font-medium text-link no-underline hover:underline"
                      >
                        All {group.label.toLowerCase()}
                      </Link>
                    ) : null}
                  </div>
                  <HitList hits={group.hits} />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function searchUrl(q: string, type: SearchType | null) {
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (type) search.set("type", type);
  const query = search.toString();
  return query ? `/search?${query}` : "/search";
}

function labelFor(type: SearchType) {
  return SEARCH_GROUPS.find((group) => group.type === type)?.label ?? "Results";
}

/** Links, not toggles: the kind is server state and belongs in the URL. */
function TypeFilter({ q, active }: { q: string; active: SearchType | null }) {
  const options: { type: SearchType | null; label: string }[] = [
    { type: null, label: "Everything" },
    ...[...SEARCH_GROUPS]
      .sort((a, b) => a.order - b.order)
      .map((group) => ({ type: group.type, label: group.label })),
  ];

  return (
    <nav aria-label="Result kinds">
      {/* Scrolls sideways on a phone rather than wrapping, as `ChipRow`
          does; a list here so the kinds are counted as a set. */}
      <ul className="vu-scroll-x -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
        {options.map((option) => {
          const current = option.type === active;
          const Icon = option.type ? TYPE_ICON[option.type] : SearchIcon;
          return (
            <li key={option.type ?? "all"} className="shrink-0">
              <Link
                href={searchUrl(q, option.type)}
                aria-current={current ? "page" : undefined}
                scroll={false}
                className={chipClass(current)}
              >
                <Icon aria-hidden />
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HitList({ hits }: { hits: ResultHit[] }) {
  return (
    <ul className={cardClass({ padding: "none", className: "divide-y divide-separator overflow-hidden" })}>
      {hits.map((hit) => (
        <li key={hit.id}>
          <Link
            href={hit.href}
            className="flex items-start gap-3 px-4 py-3 text-foreground no-underline transition hover:bg-surface-muted sm:px-5"
          >
            <HitMark hit={hit} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold leading-snug">
                {hit.title}
              </span>
              <span className="mt-0.5 block truncate text-caption text-foreground-muted">
                {hit.detail}
              </span>
              {hit.snippet && hit.type !== "member" ? (
                <span className="mt-1 line-clamp-2 block text-label leading-snug text-foreground-muted">
                  {hit.snippet}
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function HitMark({ hit }: { hit: ResultHit }) {
  if (hit.type === "member") {
    return <Avatar name={hit.title} src={hit.imageUrl} size="sm" className="shrink-0" />;
  }
  if (hit.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- course covers come from several hosts
      <img
        src={hit.imageUrl}
        alt=""
        className="size-9 shrink-0 rounded-ctl object-cover"
        loading="lazy"
      />
    );
  }
  const Icon = TYPE_ICON[hit.type];
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-ctl bg-brand-wash text-on-brand-wash">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}
