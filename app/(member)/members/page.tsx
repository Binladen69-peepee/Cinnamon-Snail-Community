import { redirect } from "next/navigation";
import { Sparkles, UserRoundSearch, Users } from "lucide-react";
import { auth } from "@/auth";
import {
  loadDirectory,
  parseMemberSort,
  parsePage,
  type MemberSort,
} from "@/lib/community/directory";
import { AppShell } from "@/components/app/app-shell";
import { UrlSearchField } from "@/components/app/url-search-field";
import {
  ButtonLink,
  EmptyState,
  PageHeader,
  Pager,
  Section,
} from "@/components/app/ui";
import { MemberCard } from "@/components/members/member-card";
import { MemberFilters } from "@/components/members/member-filters";

export const metadata = { title: "Members" };

/** The directory grid, shared by suggestions and everyone. */
const GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3";

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
    <AppShell size="wide">
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Members"
          description={
            filtering ? (
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
            )
          }
        >
          <div className="flex flex-col gap-3">
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
          </div>
        </PageHeader>

        {data.suggested.length > 0 ? (
          <Section title="People you should meet" icon={<Sparkles />}>
            <ul className={GRID}>
              {data.suggested.map((member) => (
                <li key={member.handle}>
                  <MemberCard member={member} showStarter />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section
          title={data.suggested.length > 0 ? "Everyone" : undefined}
          icon={<Users />}
          count={data.total}
        >
          {data.members.length === 0 ? (
            <Blank
              filtering={filtering}
              q={q}
              empty={data.totalUnfiltered === 0}
            />
          ) : (
            <ul className={GRID}>
              {data.members.map((member) => (
                <li key={member.handle}>
                  <MemberCard member={member} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {data.pageCount > 1 ? (
          <Pager
            {...pagerHrefs({
              page: data.page,
              pageCount: data.pageCount,
              q,
              sort,
              active: data.active,
            })}
            summary={`Page ${data.page} of ${data.pageCount}`}
            className="border-t border-border pt-4"
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
    <EmptyState
      icon={<UserRoundSearch />}
      title={title}
      description={body}
      action={filtering ? <ButtonLink href="/members">Show everyone</ButtonLink> : undefined}
    />
  );
}

/**
 * Previous and next for the directory. A missing href is a disabled end.
 *
 * The links carry the query, the sort and the location, interest and skill
 * filters, exactly as they always have. (They do not carry `cohort` or
 * `space`; that is flagged rather than changed here.)
 */
function pagerHrefs({
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

  return {
    prevHref: page <= 1 ? null : href(page - 1),
    nextHref: page >= pageCount ? null : href(page + 1),
  };
}
