import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Compass, SearchX } from "lucide-react";
import { auth } from "@/auth";
import {
  loadDiscover,
  parseDiscoverTab,
  type DiscoverTab,
} from "@/lib/community/discover";
import { AppShell } from "@/components/app/app-shell";
import { UrlSearchField } from "@/components/app/url-search-field";
import { DiscoverTabs } from "@/components/discover/discover-tabs";
import { ClassBrowser } from "@/components/discover/class-browser";
import { PersonCard } from "@/components/discover/person-card";
import { EventCard } from "@/components/discover/event-card";
import { SpaceCard } from "@/components/spaces/space-card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Discover" };

/**
 * Discover — one search across the classes, rooms, people and gatherings a
 * member is allowed to see.
 *
 * Everything that decides what is rendered lives in the URL: `?q`, `?tab` and
 * `?category`. That makes a result shareable, survivable across a reload, and
 * indexed by the back button, none of which client-side filter state gives you.
 * The only client components are the ones that genuinely need a browser — the
 * type-ahead field, the follow button, and the class panel.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string; category?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const params = await searchParams;
  const tab = parseDiscoverTab(params.tab);
  const q = (params.q ?? "").trim();
  const category = params.category?.trim() || null;

  const data = await loadDiscover({ userId: session.user.id, tab, q, category });
  // On a section tab only that section is rendered, so "nothing found" has to
  // mean nothing in *this* section -- otherwise a query that matches a person
  // but no class leaves the Classes tab showing an empty grid and no reason.
  const total =
    data.counts.classes +
    data.counts.spaces +
    data.counts.people +
    data.counts.events;
  const found = tab === "all" ? total : data.counts[tab];

  return (
    <AppShell wide>
      <div className="mx-auto w-full max-w-[1160px] space-y-5 pb-4">
        <header className="space-y-3">
          <div>
            <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
              Discover
            </h1>
            <p className="mt-1 text-[14px] text-foreground-muted">
              {q ? (
                found > 0 ? (
                  <>
                    {found} {found === 1 ? "result" : "results"} for{" "}
                    <span className="font-semibold text-foreground">“{q}”</span>
                  </>
                ) : (
                  <>
                    Nothing matched{" "}
                    <span className="font-semibold text-foreground">“{q}”</span>
                  </>
                )
              ) : (
                <>
                  {data.counts.classes} classes, {data.counts.spaces} rooms,{" "}
                  {data.counts.people}{" "}
                  {data.counts.people === 1 ? "member" : "members"} and{" "}
                  {data.counts.events}{" "}
                  {data.counts.events === 1 ? "gathering" : "gatherings"} to
                  explore.
                </>
              )}
            </p>
          </div>

          <UrlSearchField
            placeholder="Search classes, rooms, people and events"
            label="Search the community"
            resetParams={["category"]}
          />
          <DiscoverTabs active={tab} q={q} counts={data.counts} />
        </header>

        {data.empty ? (
          <Blank
            icon={<Compass className="size-6" aria-hidden />}
            title="There is nothing here yet"
            body="Once hosts publish classes and open rooms, this is where you will find them."
          />
        ) : found === 0 ? (
          <Blank
            icon={<SearchX className="size-6" aria-hidden />}
            title={emptyTitle(tab, q, category)}
            body={
              tab === "all"
                ? "Try a shorter word, or a dish rather than a description."
                : "Other sections may still have something — the counts above say which."
            }
            action={{
              href: q || category ? clearHref(tab, q, category) : "/discover",
              label: category && tab === "classes" ? "Show every class" : "Clear the search",
            }}
          />
        ) : (
          <div className="space-y-7">
            {show(tab, "classes", data.counts.classes) ? (
              <Section
                title="Classes"
                count={data.counts.classes}
                shown={data.classes.length}
                href={sectionHref("classes", q)}
                tab={tab}
              >
                {tab === "classes" && data.categories.length > 1 ? (
                  <CategoryFilter
                    categories={data.categories}
                    active={data.category}
                    q={q}
                  />
                ) : null}
                <ClassBrowser
                  classes={data.classes}
                  discussHref={data.courseRoomHref}
                />
              </Section>
            ) : null}

            {show(tab, "spaces", data.counts.spaces) ? (
              <Section
                title="Rooms"
                count={data.counts.spaces}
                shown={data.spaces.length}
                href={sectionHref("spaces", q)}
                tab={tab}
              >
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {data.spaces.map((space) => (
                    <SpaceCard key={space.id} space={space} />
                  ))}
                </div>
              </Section>
            ) : null}

            {show(tab, "people", data.counts.people) ? (
              <Section
                title="People"
                count={data.counts.people}
                shown={data.people.length}
                href={sectionHref("people", q)}
                tab={tab}
              >
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {data.people.map((person) => (
                    <PersonCard key={person.handle} person={person} />
                  ))}
                </div>
              </Section>
            ) : null}

            {show(tab, "events", data.counts.events) ? (
              <Section
                title="Gatherings"
                count={data.counts.events}
                shown={data.events.length}
                href={sectionHref("events", q)}
                tab={tab}
              >
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {data.events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </div>
              </Section>
            ) : null}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function emptyTitle(tab: DiscoverTab, q: string, category: string | null): string {
  if (q) return `No matches for “${q}”`;
  if (category) return `Nothing in ${category} yet`;
  return "Nothing here yet";
}

/** Drops whichever filter is narrowing hardest, keeping the visitor's place. */
function clearHref(tab: DiscoverTab, q: string, category: string | null): string {
  const search = new URLSearchParams();
  if (tab !== "all") search.set("tab", tab);
  // A category is the cheaper thing to give up, so it goes first.
  if (q && !category) search.delete("q");
  else if (q) search.set("q", q);
  const query = search.toString();
  return query ? `/discover?${query}` : "/discover";
}

/** A section appears on its own tab, or on "all" when it has anything to show. */
function show(
  tab: DiscoverTab,
  section: "classes" | "spaces" | "people" | "events",
  count: number,
): boolean {
  if (tab === section) return true;
  return tab === "all" && count > 0;
}

function sectionHref(tab: DiscoverTab, q: string): string {
  const search = new URLSearchParams({ tab });
  if (q) search.set("q", q);
  return `/discover?${search.toString()}`;
}

function Section({
  title,
  count,
  shown,
  href,
  tab,
  children,
}: {
  title: string;
  count: number;
  /** How many of `count` are on screen, so "See all" only appears when it adds something. */
  shown: number;
  href: string;
  tab: DiscoverTab;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
          {title}
          <span className="tabular-nums font-semibold">{count}</span>
        </h2>
        {tab === "all" && shown < count ? (
          <Link
            href={href}
            scroll={false}
            className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-brand no-underline hover:underline"
          >
            See all {count}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function CategoryFilter({
  categories,
  active,
  q,
}: {
  categories: string[];
  active: string | null;
  q: string;
}) {
  function href(category: string | null) {
    const search = new URLSearchParams({ tab: "classes" });
    if (q) search.set("q", q);
    if (category) search.set("category", category);
    return `/discover?${search.toString()}`;
  }

  return (
    <ul className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
      {[null, ...categories].map((category) => {
        const current = category === active;
        return (
          <li key={category ?? "all"}>
            <Link
              href={href(category)}
              scroll={false}
              aria-current={current ? "true" : undefined}
              className={cn(
                "inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold no-underline transition",
                current
                  ? "border-brand bg-brand-wash text-brand-strong"
                  : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
              )}
            >
              {category ?? "All classes"}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Blank({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-card border border-dashed border-border bg-surface px-6 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-wash text-brand-strong">
        {icon}
      </span>
      <h2 className="mt-3 font-display text-[1.15rem] font-bold text-foreground">
        {title}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[42ch] text-[14px] text-foreground-muted">
        {body}
      </p>
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
