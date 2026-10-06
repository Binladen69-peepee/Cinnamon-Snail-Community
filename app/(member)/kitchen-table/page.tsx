import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronDown, ExternalLink } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listFeed } from "@/lib/community/feed";
import { toFeedCard } from "@/lib/community/feed-card";
import { parseFeedSort } from "@/lib/community/sort";
import { popularThisWeek } from "@/lib/community/trending";
import { getKitchenTableChrome, type KitchenTableChrome } from "@/lib/community/kitchen-table";
import { KITCHEN_TABLE_PATH } from "@/lib/community/system-spaces";
import { getEventViewer, visibleEventsWhere } from "@/lib/events/access";
import { peopleYouShouldMeet } from "@/lib/social/suggestions";
import { photoForKnownClass } from "@/lib/marketing/class-library";
import { getNextLiveClass } from "@/lib/marketing/catalog";
import { uploadsConfigured } from "@/lib/uploads/storage";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/ui";
import { Composer } from "@/components/feed/composer";
import { FeedToolbar, type Density } from "@/components/feed/feed-toolbar";
import { FeedModeToggle, parseFeedMode } from "@/components/feed/feed-mode-toggle";
import { Reels } from "@/components/feed/reels";
import { FeedStream } from "@/components/feed/feed-stream";
import { FeedRail, ResourceList, type RailEvent } from "@/components/feed/feed-rail";
import { FeedEmpty } from "@/components/feed/feed-empty";
import { PostList } from "@/components/feed/post-list";
import { TableTools } from "@/components/spaces/table-tools";
import { RoadmapFocusCard } from "@/components/roadmap/roadmap-focus-card";

export const metadata = { title: "Kitchen Table" };

/** Pins shown before "show more": enough to see them, not so many the feed is gone. */
const PINS_SHOWN_FIRST = 3;

const DEFAULT_DESCRIPTION =
  "The whole community around one table. Share what you cooked, ask anything, and pin the posts you want to keep close.";

/**
 * The Kitchen Table: the community (DEC-078).
 *
 * One feed for every general room, the way a Facebook group is one feed: the
 * member's own pinned posts first, then the team's announcements, then
 * everything else in the order they chose. Posting happens right here and
 * lands here. Ideas have their own board and never appear in this feed; a
 * Bulletin Board item appears as the post that carries its conversation.
 *
 * Reels is a view of the same feed (`?view=reels`): its videos, one per
 * screen.
 */
export default async function KitchenTablePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; view?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(KITCHEN_TABLE_PATH)}`);
  }
  const userId = session.user.id;

  const params = await searchParams;
  const sort = parseFeedSort(params.sort);
  const mode = parseFeedMode(params.view);

  const viewer = {
    name: session.user.name || session.user.handle,
    avatar: session.user.image ?? null,
    handle: session.user.handle,
  };

  // Reels are edge to edge and take the whole column: no rail, no gutters,
  // one video per screen. The toggle stays above so the way back is a tap.
  if (mode === "reels") {
    const feed = await listFeed({ userId, sort, take: 20, kind: "video" });
    return (
      <AppShell flush>
        {/* Exactly the space between the app bar and the tab bar, as a flex
            column: the toggle takes its own height and the reels the rest.
            The negative bottom margin cancels the shell's page padding so the
            page itself has nothing left to scroll. */}
        <div className="-mb-24 flex h-[calc(100dvh-3.5rem-var(--vu-tabbar,0px))] flex-col md:-mb-10 md:h-[calc(100dvh-3.5rem)]">
          <h1 className="sr-only">Kitchen Table reels</h1>
          <div className="flex shrink-0 justify-center px-4 pt-3 md:mx-auto md:w-full md:max-w-130 md:px-0">
            <FeedModeToggle mode={mode} sort={sort} />
          </div>
          <div className="mt-3 min-h-0 flex-1">
            <Reels
              key={sort}
              // Pins and announcements are kept out of the paged feed so paging
              // cannot repeat them; a pinned reel still belongs at the top.
              initialPosts={[...feed.myPins, ...feed.pinned, ...feed.posts].map(toFeedCard)}
              initialCursor={feed.nextCursor}
              sort={sort}
              viewer={viewer}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  const [density, feed, chrome, rail] = await Promise.all([
    readDensity(),
    listFeed({ userId, sort, take: 20 }),
    getKitchenTableChrome(userId),
    loadRail(userId),
  ]);

  // Hosts and staff can make announcements and take posts down. The server
  // checks again on every one of those actions.
  const canModerate = chrome.canModerate;
  const myPins = feed.myPins.map(toFeedCard);
  const announcements = feed.pinned.map(toFeedCard);
  const above = [...myPins, ...announcements].map((post) => post.id);

  return (
    <AppShell
      rail={
        <FeedRail
          focus={
            // Streamed: the member's roadmap topic must never hold up the feed.
            <Suspense fallback={null}>
              <RoadmapFocusCard userId={userId} />
            </Suspense>
          }
          events={rail.events}
          suggestions={rail.suggestions}
          popular={rail.popular}
          resources={chrome.resources}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Kitchen Table"
          description={chrome.description?.trim() || DEFAULT_DESCRIPTION}
        >
          {/* The view switch, and the table's own controls at the far end, so
              their menu always has room to open on a phone. */}
          <div className="flex flex-wrap items-center gap-2">
            <FeedModeToggle mode="feed" sort={sort} />
            <TableControls chrome={chrome} />
          </div>
        </PageHeader>

        <MobileFocus userId={userId} />

        <MobileResources resources={chrome.resources} />

        <Composer
          name={viewer.name}
          avatar={viewer.avatar}
          uploadsEnabled={uploadsConfigured()}
        />

        <FeedToolbar sort={sort} basePath={KITCHEN_TABLE_PATH} density={density} />

        <PostList
          label="Your pinned posts"
          posts={myPins}
          viewer={viewer}
          density={density}
          canPin={canModerate}
          pinnedMark
          initiallyShown={PINS_SHOWN_FIRST}
        />

        <PostList
          label="Announcements"
          posts={announcements}
          viewer={viewer}
          density={density}
          canPin={canModerate}
        />

        <FeedStream
          key={sort}
          initialPosts={feed.posts.map(toFeedCard)}
          initialCursor={feed.nextCursor}
          sort={sort}
          viewer={viewer}
          density={density}
          canPin={canModerate}
          alsoShown={above}
          emptyState={above.length > 0 ? null : <FeedEmpty sort={sort} />}
        />
      </div>
    </AppShell>
  );
}

/** The header's own controls: notifications for everyone, review and settings for hosts. */
function TableControls({ chrome }: { chrome: KitchenTableChrome }) {
  const level =
    chrome.notificationLevel === "ALL" ||
    chrome.notificationLevel === "HIGHLIGHTS" ||
    chrome.notificationLevel === "NONE"
      ? chrome.notificationLevel
      : null;
  const defaultLevel =
    chrome.notificationDefault === "HIGHLIGHTS" || chrome.notificationDefault === "NONE"
      ? chrome.notificationDefault
      : "ALL";
  return (
    <TableTools
      spaceId={chrome.spaceId}
      slug={chrome.slug}
      joined={chrome.joined}
      level={level}
      defaultLevel={defaultLevel}
      canModerate={chrome.canModerate}
      canManage={chrome.canManage}
      pendingCount={chrome.pendingCount}
    />
  );
}

/**
 * The member's roadmap topic where there is no rail (DEC-080). The rail, and
 * the card in it, only show from `xl`, so phones and tablets get the same card
 * at the top of the column instead, and wide screens never see two.
 *
 * `contents` gives the wrapper no box of its own: a member without a roadmap
 * gets no card and no empty gap in the column. Streamed, like the rail's, so
 * the feed never waits for it.
 */
function MobileFocus({ userId }: { userId: string }) {
  return (
    <div className="contents xl:hidden">
      <Suspense fallback={null}>
        <RoadmapFocusCard userId={userId} />
      </Suspense>
    </div>
  );
}

/**
 * The table's links on a phone, where there is no rail: one quiet line that
 * opens, rather than a card that pushes the first post down on every visit.
 */
function MobileResources({ resources }: { resources: KitchenTableChrome["resources"] }) {
  if (resources.length === 0) return null;
  return (
    <details className="group rounded-card border border-border bg-surface shadow-e1 xl:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-card px-4 py-3 text-label font-medium text-foreground transition hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
        <ExternalLink className="size-4 shrink-0 text-brand" aria-hidden />
        <span className="flex-1">Kitchen Table links</span>
        <span className="text-caption tabular-nums text-foreground-muted">{resources.length}</span>
        <ChevronDown
          className="size-4 shrink-0 text-foreground-muted transition group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-separator">
        <ResourceList resources={resources} />
      </div>
    </details>
  );
}

/**
 * Density lives in a cookie rather than the URL, because it is a property of
 * the member rather than of the page. Cards by default, the way a community
 * feed reads; members who chose compact rows keep them.
 */
async function readDensity(): Promise<Density> {
  const store = await cookies();
  return store.get("vu-density")?.value === "compact" ? "compact" : "card";
}

/**
 * The rail's data, in one round of parallel queries. Each part fails on its
 * own: a slow suggestion query or a missing class must not take the feed down.
 */
async function loadRail(userId: string) {
  const now = Date.now();
  // A class that started up to two hours ago is still worth showing as live.
  const runningSince = new Date(now - 2 * 60 * 60 * 1000);

  const eventViewer = await getEventViewer(userId).catch(() => null);
  const [events, suggestions, popular, nextLive] = await Promise.all([
    eventViewer
      ? prisma.event
          .findMany({
            where: {
              AND: [
                visibleEventsWhere(eventViewer),
                { status: "PUBLISHED", startsAt: { gte: runningSince } },
              ],
            },
            orderBy: { startsAt: "asc" },
            take: 2,
            select: {
              id: true,
              slug: true,
              title: true,
              startsAt: true,
              endsAt: true,
              coverUrl: true,
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
    peopleYouShouldMeet(userId, 3).catch(() => []),
    popularThisWeek(userId, 4).catch(() => []),
    getNextLiveClass().catch(() => null),
  ]);

  const fromEvents: RailEvent[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    live:
      event.startsAt.getTime() <= now &&
      (event.endsAt
        ? event.endsAt.getTime() >= now
        : now - event.startsAt.getTime() < 60 * 60 * 1000),
    href: `/live-classes/${event.slug}`,
    coverUrl: photoForKnownClass(event.title, event.coverUrl),
  }));

  const liveClass: RailEvent[] =
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
    events: liveClass,
    suggestions,
    popular: popular.map((item) => ({
      id: item.id,
      label: item.label,
      authorName: item.authorName,
      comments: item.comments,
    })),
  };
}
