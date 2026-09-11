import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { listFeed } from "@/lib/community/posts";
import { PostCard } from "@/components/community/post-card";
import { FeedSortBar } from "@/components/community/feed-sort-bar";
import { FeedComposer } from "@/components/community/feed-composer";
import { FeedHeader } from "@/components/community/feed-header";
import { FeedEmpty } from "@/components/community/feed-empty";
import { FeedRail } from "@/components/community/feed-rail";
import { parseFeedSort } from "@/lib/community/sort";
import { recentRecognition } from "@/lib/social/badges";
import { peopleYouShouldMeet } from "@/lib/social/suggestions";
import { getContinueLearning } from "@/lib/learn/catalog";

export const metadata = { title: "Kitchen Table" };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const sort = parseFeedSort((await searchParams).sort);

  const {
    posts,
    spaces,
    recognition,
    suggestions,
    newToday,
    nextEvent,
    mySpaces,
    railEvents,
    continueLearning,
  } = await loadFeed(session.user.id, sort);
  const kitchen = spaces.find((space) => space.slug === "kitchen-table") ?? spaces[0];
  const currentName = session.user.name || session.user.handle;
  const viewer = { name: currentName, avatar: session.user.image ?? null };
  const isHost = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN" || role === "HOST",
  );

  const railProps = {
    // Already shaped by loadFeed: deciding what counts as "live" needs the
    // clock, which is not something to read during render.
    nextEvents: railEvents,
    progress: continueLearning.map((item) => ({
      courseSlug: item.course.slug,
      courseTitle: item.course.title,
      percent: item.percent,
    })),
    suggestions: suggestions.map((person) => ({
      userId: person.userId,
      displayName: person.displayName,
      handle: person.handle,
      avatarUrl: person.avatarUrl,
      reason: person.reason,
    })),
    spaces: spaces.map((space) => ({
      name: space.name,
      slug: space.slug,
      coverUrl: space.coverUrl,
      memberCount: space._count.memberships,
    })),
    recognition: recognition.map((award) => ({
      id: award.id,
      icon: award.badge.icon ?? "🌱",
      badgeName: award.badge.name,
      memberName: award.user.profile?.displayName ?? award.user.handle,
      handle: award.user.handle,
    })),
  };

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1 space-y-5">
        <FeedHeader
          firstName={currentName.split(" ")[0]}
          spaceCount={spaces.length}
          nextEvent={
            nextEvent ? { title: nextEvent.title, when: nextEvent.startsAt } : null
          }
          newToday={newToday}
        />

        <FeedComposer
          name={currentName}
          avatar={viewer.avatar}
          spaces={mySpaces}
          defaultSpaceId={kitchen?.id}
        />

        {/* Sticks under the app bar so the sort stays reachable in a long feed
            without a jump-to-top trip. The rule is on this wrapper rather than
            the tabs, so the active tab's indicator sits on top of it. */}
        <div className="sticky top-[72px] z-20 -mx-1 border-b border-border/70 bg-background/90 px-1 pt-1 backdrop-blur-sm">
          <FeedSortBar current={sort} basePath="/home" />
        </div>

        <div className="space-y-4">
          {posts.length === 0 ? (
            <FeedEmpty sort={sort} />
          ) : (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                viewer={viewer}
                canPin={isHost}
              />
            ))
          )}
        </div>

        <div className="space-y-5 xl:hidden">
          <FeedRail stacked {...railProps} />
        </div>
      </div>

      <div className="hidden xl:block">
        <FeedRail {...railProps} />
      </div>
    </div>
  );
}

/**
 * Everything the feed page needs, in one round of parallel queries.
 *
 * Kept out of the component body so the timestamp maths is not an impure call
 * during render, and so the page reads as layout rather than data plumbing.
 */
async function loadFeed(userId: string, sort: ReturnType<typeof parseFeedSort>) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    feed,
    spaces,
    mySpaces,
    recognition,
    suggestions,
    newToday,
    nextEvent,
    railEvents,
    continueLearning,
  ] = await Promise.all([
    listFeed({ userId, sort, take: 25 }),
    prisma.space.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        coverUrl: true,
        description: true,
        _count: { select: { memberships: true } },
      },
    }),
    // Only the spaces this member belongs to, for the composer's picker.
    prisma.space.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    recentRecognition(4),
    peopleYouShouldMeet(userId, 3),
    prisma.post.count({
      where: { status: "PUBLISHED", publishedAt: { gte: dayAgo } },
    }),
    prisma.event.findFirst({
      where: { startsAt: { gt: new Date() } },
      orderBy: { startsAt: "asc" },
      select: { title: true, startsAt: true },
    }),
    // Anything still running counts as upcoming, so a class in progress shows
    // as live rather than disappearing the moment it starts.
    prisma.event.findMany({
      where: { startsAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
      orderBy: { startsAt: "asc" },
      take: 3,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        space: { select: { name: true } },
      },
    }),
    getContinueLearning(userId),
  ]);

  // Live while the class is running, or for an hour after it starts when no end
  // time was set - a class with no endsAt is still a class in progress.
  const now = Date.now();
  const railEventsShaped = railEvents.map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    spaceName: event.space?.name ?? null,
    live:
      event.startsAt.getTime() <= now &&
      (event.endsAt
        ? event.endsAt.getTime() >= now
        : now - event.startsAt.getTime() < 60 * 60 * 1000),
  }));

  return {
    posts: feed.posts,
    spaces,
    recognition,
    suggestions,
    newToday,
    nextEvent,
    mySpaces,
    railEvents: railEventsShaped,
    continueLearning,
  };
}
