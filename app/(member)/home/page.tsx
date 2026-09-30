import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listFeed, type FeedKind } from "@/lib/community/posts";
import { toFeedCard } from "@/lib/community/feed-card";
import { parseFeedSort } from "@/lib/community/sort";
import { peopleYouShouldMeet } from "@/lib/social/suggestions";
import { trendingSpaces } from "@/lib/community/trending";
import { photoForKnownClass } from "@/lib/marketing/class-library";
import { getNextLiveClass } from "@/lib/marketing/catalog";
import { uploadsConfigured } from "@/lib/uploads/storage";
import { AppShell } from "@/components/app/app-shell";
import { Composer } from "@/components/feed/composer";
import { FeedToolbar, type Density } from "@/components/feed/feed-toolbar";
import { FeedModeToggle, parseFeedMode } from "@/components/feed/feed-mode-toggle";
import { Reels } from "@/components/feed/reels";
import { PostCard } from "@/components/feed/post-card";
import { FeedStream } from "@/components/feed/feed-stream";
import { FeedRail } from "@/components/feed/feed-rail";
import { FeedEmpty } from "@/components/feed/feed-empty";

export const metadata = { title: "Explorer" };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; view?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const params = await searchParams;
  const sort = parseFeedSort(params.sort);
  const mode = parseFeedMode(params.view);
  const density = await readDensity();
  const data = await loadFeed(session.user.id, sort, mode === "reels" ? "video" : "all");

  const viewer = {
    name: session.user.name || session.user.handle,
    avatar: session.user.image ?? null,
    handle: session.user.handle,
  };
  const isStaff = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN" || role === "HOST",
  );

  // Reels are edge to edge and take the whole column: no rail, no gutters,
  // one video per screen. The toggle stays above so the way back is a tap.
  if (mode === "reels") {
    return (
      <AppShell flush>
        {/* Exactly the space between the app bar and the tab bar, as a flex
            column: the toggle takes its own height and the reels take the
            rest. Sizing the reels with a fixed calc instead left the toggle's
            height unaccounted for, and the bottom of every reel ran under the
            tab bar. The negative bottom margin cancels the shell's page
            padding so the page itself has nothing left to scroll. */}
        <div className="-mb-24 flex h-[calc(100dvh-3.5rem-var(--vu-tabbar,0px))] flex-col md:-mb-6 md:h-[calc(100dvh-3.5rem)]">
          <div className="shrink-0 px-3 pt-3 md:mx-auto md:w-full md:max-w-130 md:px-0">
            <FeedModeToggle mode={mode} sort={sort} />
          </div>
          <div className="mt-3 min-h-0 flex-1">
            <Reels
              key={sort}
              // `listFeed` keeps pinned posts out of the page so paging cannot
              // repeat them; a pinned reel still belongs at the top here.
              initialPosts={[...data.pinned.map(toFeedCard), ...data.posts]}
              initialCursor={data.nextCursor}
              sort={sort}
              viewer={viewer}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      rail={
        <FeedRail
          events={data.events}
          suggestions={data.suggestions}
          trending={data.trending}
        />
      }
    >
      <div className="space-y-3">
        <FeedModeToggle mode={mode} sort={sort} />

        <Composer
          name={viewer.name}
          avatar={viewer.avatar}
          spaces={data.mySpaces}
          defaultSpaceId={data.defaultSpaceId}
          uploadsEnabled={uploadsConfigured()}
        />

        <FeedToolbar sort={sort} basePath="/home" density={density} />

        {data.pinned.length > 0 ? (
          <div className="space-y-3">
            {data.pinned.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                viewer={viewer}
                density={density}
                canPin={isStaff}
              />
            ))}
          </div>
        ) : null}

        <FeedStream
          key={sort}
          initialPosts={data.posts}
          initialCursor={data.nextCursor}
          sort={sort}
          viewer={viewer}
          density={density}
          canPin={isStaff}
          emptyState={
            data.pinned.length > 0 ? null : (
              <FeedEmpty sort={sort} hasSpaces={data.mySpaces.length > 0} />
            )
          }
        />
      </div>
    </AppShell>
  );
}

/**
 * Density lives in a cookie rather than the URL, because it is a property of
 * the member rather than of the page — it should follow them to every feed and
 * survive a shared link.
 */
async function readDensity(): Promise<Density> {
  const store = await cookies();
  return store.get("vu-density")?.value === "card" ? "card" : "compact";
}

/**
 * Everything the page needs, in one round of parallel queries.
 *
 * Kept out of the component body so the clock is never read during render, and
 * so the page reads as layout rather than data plumbing.
 */
async function loadFeed(
  userId: string,
  sort: ReturnType<typeof parseFeedSort>,
  kind: FeedKind,
) {
  const runningSince = new Date(Date.now() - 2 * 60 * 60 * 1000);

  // Reels renders neither the composer nor the rail, so it does not pay for
  // the queries behind them.
  const withRail = kind === "all";

  const [feed, mySpaces, events, suggestions, trending, nextLive] = await Promise.all([
    listFeed({ userId, sort, take: 20, kind }),
    withRail
      ? prisma.space.findMany({
          where: { memberships: { some: { userId } } },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve([]),
    withRail
      ? prisma.event.findMany({
          where: { startsAt: { gte: runningSince } },
          orderBy: { startsAt: "asc" },
          take: 2,
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            coverUrl: true,
            space: { select: { slug: true } },
          },
        })
      : Promise.resolve([]),
    withRail ? peopleYouShouldMeet(userId, 3) : Promise.resolve([]),
    withRail ? trendingSpaces(userId, 5) : Promise.resolve([]),
    withRail ? getNextLiveClass().catch(() => null) : Promise.resolve(null),
  ]);

  const now = Date.now();
  const fromEvents = events.map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    live:
      event.startsAt.getTime() <= now &&
      (event.endsAt
        ? event.endsAt.getTime() >= now
        : now - event.startsAt.getTime() < 60 * 60 * 1000),
    href: event.space?.slug ? `/spaces/${event.space.slug}` : "/calendar",
    coverUrl: photoForKnownClass(event.title, event.coverUrl),
  }));

  const liveClass =
    fromEvents.length > 0
      ? fromEvents
      : nextLive?.liveAt
        ? [
            {
              id: nextLive.slug,
              title: nextLive.title,
              startsAt: nextLive.liveAt,
              live: false,
              href: `/learn/${nextLive.slug}`,
              coverUrl: photoForKnownClass(nextLive.title),
            },
          ]
        : [];

  return {
    // Serialised to the card shape here rather than in the component, so the
    // first page and every page after it are the same object.
    posts: feed.posts.map(toFeedCard),
    pinned: feed.pinned,
    nextCursor: feed.nextCursor,
    mySpaces,
    defaultSpaceId:
      mySpaces.find((space) => space.slug === "kitchen-table")?.id ?? mySpaces[0]?.id,
    events: liveClass,
    suggestions,
    trending,
  };
}
