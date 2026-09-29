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
import { cn } from "@/lib/utils";

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
      <div className="space-y-5 pb-4">
        <header className="space-y-3">
          <div>
            <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
              Search
            </h1>
            <p className="mt-1 text-[14px] text-foreground-muted">
              Members, posts, classes, lessons and events, in one place.
            </p>
          </div>

          <UrlSearchField placeholder="Search Vegan University" label="Search everything" />

          <TypeFilter q={q} active={type} />
        </header>

        {q.length < 2 ? (
          <Notice
            icon={SearchIcon}
            title={q ? "Keep typing" : "What are you looking for?"}
            body={
              q
                ? "Search needs at least two characters."
                : "Try a member’s name, an ingredient, a class or a technique."
            }
          />
        ) : failed ? (
          <Notice
            icon={SearchX}
            tone="danger"
            title="Search didn’t answer"
            body="Something went wrong on our side. Try again in a moment."
            action={{ href: searchUrl(q, type), label: "Try again" }}
          />
        ) : hits.length === 0 ? (
          <Notice
            icon={SearchX}
            title={`Nothing matches “${q}”`}
            body={
              type
                ? "Nothing of this kind matches. Other kinds might."
                : "Try a shorter word or a different spelling. Private rooms you are not in are never searched."
            }
            action={type ? { href: searchUrl(q, null), label: "Search everything" } : undefined}
          />
        ) : type ? (
          <section aria-label={`${labelFor(type)} matching ${q}`}>
            <p className="mb-2.5 text-[12.5px] font-semibold tabular-nums text-foreground-muted">
              {hits.length >= PER_TYPE ? `The first ${PER_TYPE}` : hits.length}{" "}
              {hits.length === 1 ? "result" : "results"}
            </p>
            <HitList hits={hits} />
          </section>
        ) : (
          <div className="space-y-6">
            {groupHits(hits, PER_GROUP).map((group) => {
              const total = hits.filter((hit) => hit.type === group.type).length;
              return (
                <section key={group.type} aria-labelledby={`search-${group.type}`}>
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <h2
                      id={`search-${group.type}`}
                      className="text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted"
                    >
                      {group.label}
                    </h2>
                    {total > PER_GROUP ? (
                      <Link
                        href={searchUrl(q, group.type)}
                        className="text-[12.5px] font-semibold text-foreground underline-offset-2 hover:underline"
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
    <nav aria-label="Result kinds" className="-mx-3 px-3 sm:mx-0 sm:px-0">
      <ul className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map((option) => {
          const current = option.type === active;
          const Icon = option.type ? TYPE_ICON[option.type] : SearchIcon;
          return (
            <li key={option.type ?? "all"}>
              <Link
                href={searchUrl(q, option.type)}
                aria-current={current ? "page" : undefined}
                scroll={false}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13.5px] font-semibold no-underline transition",
                  current
                    ? "border-brand-fill bg-brand-fill text-brand-fill-foreground"
                    : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
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
    <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
      {hits.map((hit) => (
        <li key={hit.id}>
          <Link
            href={hit.href}
            className="flex items-start gap-3 px-3.5 py-3 text-foreground no-underline transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
          >
            <HitMark hit={hit} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold leading-snug">
                {hit.title}
              </span>
              <span className="block truncate text-[12.5px] text-foreground-muted">
                {hit.detail}
              </span>
              {hit.snippet && hit.type !== "member" ? (
                <span className="mt-1 line-clamp-2 block text-[13px] leading-snug text-foreground-muted">
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

function Notice({
  icon: Icon,
  title,
  body,
  action,
  tone = "neutral",
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { href: string; label: string };
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className="rounded-card border border-dashed border-border bg-surface px-6 py-14 text-center"
    >
      <span
        className={cn(
          "mx-auto grid size-12 place-items-center rounded-full",
          tone === "danger" ? "bg-danger/10 text-danger" : "bg-brand-wash text-on-brand-wash",
        )}
      >
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="mt-3 font-display text-[1.15rem] font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[14px] text-foreground-muted">{body}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-flex h-9 items-center rounded-ctl border border-border bg-background px-4 text-[13.5px] font-semibold text-foreground no-underline transition hover:border-hairline-firm"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
