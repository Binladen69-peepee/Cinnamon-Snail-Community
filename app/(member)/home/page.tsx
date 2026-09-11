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
    eventPosts,
    recentComments,
    recognition,
    suggestions,
    newToday,
    nextEvent,
    memberCount,
    mySpaces,
  } = await loadFeed(session.user.id, sort);
  const kitchen = spaces.find((space) => space.slug === "kitchen-table") ?? spaces[0];
  const currentName = session.user.name || session.user.handle;
  const viewer = { name: currentName, avatar: session.user.image ?? null };
  const isHost = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN" || role === "HOST",
  );

  const railProps = {
    community: {
      name: kitchen?.name ?? "Vegan University",
      description: kitchen?.description ?? null,
      coverUrl: kitchen?.coverUrl ?? null,
    },
    memberCount,
    spaces: spaces.map((space) => ({
      name: space.name,
      slug: space.slug,
      coverUrl: space.coverUrl,
      memberCount: space._count.memberships,
    })),
    events: eventPosts.map((event) => ({
      id: event.id,
      title: event.title,
      publishedAt: event.publishedAt,
      spaceName: event.space.name,
    })),
    activity: recentComments.map((item) => ({
      id: item.id,
      body: item.body,
      createdAt: item.createdAt,
      authorName: item.author.profile?.displayName ?? item.author.handle,
      avatar: item.author.profile?.avatarUrl ?? null,
    })),
    recognition: recognition.map((award) => ({
      id: award.id,
      icon: award.badge.icon ?? "🌱",
      badgeName: award.badge.name,
      reason: award.reason ?? award.badge.description,
      memberName: award.user.profile?.displayName ?? award.user.handle,
      handle: award.user.handle,
      avatar: award.user.profile?.avatarUrl ?? null,
    })),
    suggestions: suggestions.map((person) => ({
      userId: person.userId,
      displayName: person.displayName,
      handle: person.handle,
      avatarUrl: person.avatarUrl,
      reason: person.reason,
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
    eventPosts,
    recentComments,
    recognition,
    suggestions,
    newToday,
    nextEvent,
    memberCount,
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
    prisma.post.findMany({
      where: { type: "EVENT", status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        publishedAt: true,
        space: { select: { name: true } },
      },
    }),
    prisma.comment.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: {
          select: {
            handle: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
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
    prisma.user.count({
      where: { deletedAt: null, status: { not: "DELETED" } },
    }),
  ]);

  return {
    posts: feed.posts,
    spaces,
    eventPosts,
    recentComments,
    recognition,
    suggestions,
    newToday,
    nextEvent,
    memberCount,
    mySpaces,
  };
}
