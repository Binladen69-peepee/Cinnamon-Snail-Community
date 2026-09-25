import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Sparkles, UserRoundSearch, Users } from "lucide-react";
import { auth } from "@/auth";
import {
  loadDirectory,
  parseMemberSort,
  parsePage,
  type MemberSort,
} from "@/lib/community/directory";
import { AppShell } from "@/components/app/app-shell";
import { UrlSearchField } from "@/components/app/url-search-field";
import { MemberCard } from "@/components/members/member-card";
import { MemberFilters } from "@/components/members/member-filters";

export const metadata = { title: "Members" };

/**
 * The member directory.
 *
 * Built to the two things BUILD.md asks of it — search and filter (9.x), and
 * suggestions carrying an explicit reason (12.2) — and to the one thing it
 * forbids: no points, no leaderboard. So there is no activity score on a card
 * and no "top members" sort. What a card shows instead is what the two of you
 * have in common, which is the only number that helps you decide to say hello.
 *
 * Search, filters, sort and page all live in the URL, so a narrowed directory
 * is a link someone can send.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    sort?: string;
    page?: string;
    location?: string;
    interest?: string;
    skill?: string;
    cohort?: string;
    space?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const params = await searchParams;
  const sort = parseMemberSort(params.sort);
  const q = (params.q ?? "").trim();

  const data = await loadDirectory({
    viewerId: session.user.id,
    q,
    sort,
    page: parsePage(params.page),
    location: params.location?.trim() || null,
    interest: params.interest?.trim() || null,
    skill: params.skill?.trim() || null,
    cohort: params.cohort?.trim() || null,
    space: params.space?.trim() || null,
  });

  const filtering = Boolean(
    q ||
      data.active.location ||
      data.active.interest ||
      data.active.skill ||
      data.active.cohort ||
      data.active.space,
  );

  return (
    <AppShell wide>
      <div className="mx-auto w-full max-w-[1160px] space-y-5 pb-4">
        <header className="space-y-3">
          <div>
            <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
              Members
            </h1>
            <p className="mt-1 text-[14px] text-foreground-muted">
              {filtering ? (
                <>
                  {data.total} of {data.totalUnfiltered}{" "}
                  {data.totalUnfiltered === 1 ? "member" : "members"} match
                </>
              ) : (
                <>
                  {data.totalUnfiltered}{" "}
                  {data.totalUnfiltered === 1 ? "person" : "people"} you can cook
                  alongside.
                </>
              )}
            </p>
          </div>

          <UrlSearchField
            placeholder="Search by name, handle, bio or place"
            label="Search members"
            resetParams={["page", "location", "interest", "skill"]}
          />

          <MemberFilters
            facets={data.facets}
            active={data.active}
            sort={sort}
            q={q}
          />
        </header>

        {data.suggested.length > 0 ? (
          <section className="space-y-2.5">
            <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              <Sparkles className="size-3" aria-hidden />
              People you should meet
            </h2>
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {data.suggested.map((member) => (
                <li key={member.handle}>
                  <MemberCard member={member} showStarter />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2.5">
          {data.suggested.length > 0 ? (
            <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
              <Users className="size-3" aria-hidden />
              Everyone
              <span className="font-semibold tabular-nums">{data.total}</span>
            </h2>
          ) : null}

          {data.members.length === 0 ? (
            <Blank
              filtering={filtering}
              q={q}
              empty={data.totalUnfiltered === 0}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {data.members.map((member) => (
                <li key={member.handle}>
                  <MemberCard member={member} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.pageCount > 1 ? (
          <Pager
            page={data.page}
            pageCount={data.pageCount}
            q={q}
            sort={sort}
            active={data.active}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function Blank({
  filtering,
  q,
  empty,
}: {
  filtering: boolean;
  q: string;
  empty: boolean;
}) {
  // An empty directory and an over-narrow filter are different problems, and
  // telling someone to "try another word" when nobody has joined yet is noise.
  const title = empty
    ? "No one is in the directory yet"
    : q
      ? `No member matches “${q}”`
      : "No member matches those filters";
  const body = empty
    ? "Members appear here once they join and leave their profile visible."
    : "Members can keep themselves out of the directory, so someone you know may simply not be listed.";

  return (
    <div className="rounded-card border border-dashed border-border bg-surface px-6 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-wash text-brand-strong">
        <UserRoundSearch className="size-6" aria-hidden />
      </span>
      <h3 className="mt-3 font-display text-[1.15rem] font-bold text-foreground">
        {title}
      </h3>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[14px] text-foreground-muted">
        {body}
      </p>
      {filtering ? (
        <Link
          href="/members"
          className="mt-4 inline-flex h-9 items-center rounded-ctl border border-border bg-background px-4 text-[13.5px] font-semibold text-foreground no-underline transition hover:border-hairline-firm"
        >
          Show everyone
        </Link>
      ) : null}
    </div>
  );
}

function Pager({
  page,
  pageCount,
  q,
  sort,
  active,
}: {
  page: number;
  pageCount: number;
  q: string;
  sort: MemberSort;
  active: { location: string | null; interest: string | null; skill: string | null };
}) {
  function href(next: number) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (active.location) search.set("location", active.location);
    if (active.interest) search.set("interest", active.interest);
    if (active.skill) search.set("skill", active.skill);
    if (sort !== "suggested") search.set("sort", sort);
    if (next > 1) search.set("page", String(next));
    const query = search.toString();
    return query ? `/members?${query}` : "/members";
  }

  return (
    <nav
      aria-label="Directory pages"
      className="flex items-center justify-between gap-3 border-t border-border pt-3"
    >
      <PagerLink href={href(page - 1)} disabled={page <= 1} rel="prev">
        <ChevronLeft className="size-4" aria-hidden />
        Previous
      </PagerLink>
      <p className="text-[12.5px] font-semibold tabular-nums text-foreground-muted">
        Page {page} of {pageCount}
      </p>
      <PagerLink href={href(page + 1)} disabled={page >= pageCount} rel="next">
        Next
        <ChevronRight className="size-4" aria-hidden />
      </PagerLink>
    </nav>
  );
}

function PagerLink({
  href,
  disabled,
  rel,
  children,
}: {
  href: string;
  disabled: boolean;
  rel: "prev" | "next";
  children: React.ReactNode;
}) {
  const className =
    "inline-flex h-9 items-center gap-1 rounded-ctl border border-border px-3 text-[13px] font-semibold no-underline transition";

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${className} cursor-not-allowed text-foreground-muted opacity-45`}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      rel={rel}
      className={`${className} bg-surface text-foreground hover:border-hairline-firm`}
    >
      {children}
    </Link>
  );
}
