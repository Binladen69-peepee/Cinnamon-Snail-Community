import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, UserRoundSearch, Users } from "lucide-react";
import { auth } from "@/auth";
import {
  CLUSTER_LIMIT,
  CLUSTER_PREVIEW,
  CLUSTER_VIEWS,
  countVisibleMembers,
  isClusterView,
  loadDirectory,
  loadMemberClusters,
  parseMemberSort,
  parsePage,
  resolveMemberView,
  viewerLocation,
  type DirectoryFilters,
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
import { MemberCluster, MEMBER_GRID } from "@/components/members/member-cluster";
import { MemberViewTabs } from "@/components/members/member-views";

export const metadata = { title: "Members" };

type Params = {
  q?: string;
  sort?: string;
  page?: string;
  location?: string;
  interest?: string;
  skill?: string;
  cohort?: string;
  space?: string;
  view?: string;
};

/**
 * Members: the community's people, three ways in.
 *
 * - **Discover** (the default) is Mighty Networks' People Explorer: Top
 *   members, Members near you, New members and Similar to you, a short row of
 *   each with "See all".
 * - **One cluster** on its own, as a full list.
 * - **All members**: the searchable directory with its filters, sort and
 *   pages, exactly as before. Any search or filter in the URL opens it, so
 *   every old link (`/members?interest=japanese`) still lands on the filtered
 *   directory.
 *
 * Every list honours the same rules: only members in the directory, never
 * across a block, never a field its owner hid, and no score or rank on any
 * card. View, search, filters, sort and page all live in the URL, so any of
 * them is a link someone can send.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/members");
  const viewerId = session.user.id;

  const params = await searchParams;
  const place = await viewerLocation(viewerId);
  const view = resolveMemberView(params, place !== null);

  return (
    <AppShell size="wide">
      {view === "all" ? (
        <Directory viewerId={viewerId} params={params} hasLocation={place !== null} />
      ) : (
        <Clusters
          viewerId={viewerId}
          view={view}
          hasLocation={place !== null}
        />
      )}
    </AppShell>
  );
}

function Header({
  description,
  view,
  hasLocation,
  children,
}: {
  description: React.ReactNode;
  view: Parameters<typeof MemberViewTabs>[0]["view"];
  hasLocation: boolean;
  children?: React.ReactNode;
}) {
  return (
    <PageHeader title="Members" description={description}>
      <div className="flex flex-col gap-3">
        <UrlSearchField
          placeholder="Search by name, handle, bio or place"
          label="Search members"
          resetParams={["page", "location", "interest", "skill"]}
        />
        <MemberViewTabs view={view} viewerHasLocation={hasLocation} />
        {children}
      </div>
    </PageHeader>
  );
}

function headline(count: number) {
  return (
    <>
      {count} {count === 1 ? "person" : "people"} you can cook alongside.
    </>
  );
}

async function Clusters({
  viewerId,
  view,
  hasLocation,
}: {
  viewerId: string;
  view: "discover" | (typeof CLUSTER_VIEWS)[number];
  hasLocation: boolean;
}) {
  const views = isClusterView(view) ? [view] : [...CLUSTER_VIEWS];
  const [count, data] = await Promise.all([
    countVisibleMembers(viewerId),
    loadMemberClusters({
      viewerId,
      views,
      limit: isClusterView(view) ? CLUSTER_LIMIT : CLUSTER_PREVIEW,
    }),
  ]);
  const shown = views.filter((option) => option !== "near" || data.viewerHasLocation);

  return (
    <div className="flex flex-col gap-8">
      <Header description={headline(count)} view={view} hasLocation={hasLocation} />
      {count === 0 ? (
        <EmptyState
          icon={<UserRoundSearch />}
          title="No one is in the directory yet"
          description="Members appear here once they join and leave their profile visible."
        />
      ) : (
        <div className="flex flex-col gap-10">
          {shown.map((option) => (
            <MemberCluster
              key={option}
              view={option}
              result={data.clusters[option]}
              preview={!isClusterView(view)}
            />
          ))}
          {/* "Near you" needs to know where you are; it stays out of the way
              until it does, and says how to switch it on. */}
          {!isClusterView(view) && !data.viewerHasLocation ? (
            <p className="flex items-center gap-2 text-label text-foreground-muted">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <span>
                Add your city to{" "}
                <Link href="/settings" className="font-medium text-link no-underline hover:underline">
                  your profile
                </Link>{" "}
                to see members near you.
              </span>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

async function Directory({
  viewerId,
  params,
  hasLocation,
}: {
  viewerId: string;
  params: Params;
  hasLocation: boolean;
}) {
  const sort = parseMemberSort(params.sort);
  const q = (params.q ?? "").trim();

  const data = await loadDirectory({
    viewerId,
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
    <div className="flex flex-col gap-8">
      <Header
        view="all"
        hasLocation={hasLocation}
        description={
          filtering ? (
            <>
              {data.total} of {data.totalUnfiltered}{" "}
              {data.totalUnfiltered === 1 ? "member" : "members"} match
            </>
          ) : (
            headline(data.totalUnfiltered)
          )
        }
      >
        <MemberFilters facets={data.facets} active={data.active} sort={sort} q={q} />
      </Header>

      <Section icon={<Users />} count={data.total} title="Everyone">
        {data.members.length === 0 ? (
          <Blank
            filtering={filtering}
            q={q}
            empty={data.totalUnfiltered === 0}
          />
        ) : (
          <ul className={MEMBER_GRID}>
            {data.members.map((member) => (
              <li key={member.handle}>
                <MemberCard member={member} context="similar" />
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
          label="Member pages"
          className="border-t border-border pt-4"
        />
      ) : null}
    </div>
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
      action={
        filtering ? <ButtonLink href="/members?view=all">Show everyone</ButtonLink> : undefined
      }
    />
  );
}

/**
 * Previous and next for the directory. A missing href is a disabled end.
 *
 * The links carry the query, the sort and every filter, so paging through a
 * filtered directory stays filtered. (They used to drop `cohort` and `space`,
 * so page two of "Joined March" was page two of everyone.)
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
  active: DirectoryFilters;
}) {
  function href(next: number) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (active.location) search.set("location", active.location);
    if (active.interest) search.set("interest", active.interest);
    if (active.skill) search.set("skill", active.skill);
    if (active.cohort) search.set("cohort", active.cohort);
    if (active.space) search.set("space", active.space);
    if (sort !== "suggested") search.set("sort", sort);
    if (next > 1) search.set("page", String(next));
    // A bare "/members" is Discover, so page one of an unfiltered directory
    // says so explicitly.
    const query = search.toString();
    return query ? `/members?${query}` : "/members?view=all";
  }

  return {
    prevHref: page <= 1 ? null : href(page - 1),
    nextHref: page >= pageCount ? null : href(page + 1),
  };
}
