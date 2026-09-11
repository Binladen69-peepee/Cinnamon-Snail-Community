import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listFeed } from "@/lib/community/posts";
import { parseFeedSort } from "@/lib/community/sort";
import { getContinueLearning } from "@/lib/learn/catalog";
import { peopleYouShouldMeet } from "@/lib/social/suggestions";
import { uploadsConfigured } from "@/lib/uploads/storage";
import { AppShell } from "@/components/app/app-shell";
import { Composer } from "@/components/feed/composer";
import { FeedToolbar, type Density } from "@/components/feed/feed-toolbar";
import { PostCard } from "@/components/feed/post-card";
import { FeedRail } from "@/components/feed/feed-rail";
import { FeedEmpty } from "@/components/feed/feed-empty";

export const metadata = { title: "Home" };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const sort = parseFeedSort((await searchParams).sort);
  const density = await readDensity();
  const data = await loadFeed(session.user.id, sort);

  const viewer = {
    name: session.user.name || session.user.handle,
    avatar: session.user.image ?? null,
  };
  const isStaff = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN" || role === "HOST",
  );

  return (
    <AppShell
      rail={
        <FeedRail
          events={data.events}
          progress={data.progress.map((item) => ({
            courseSlug: item.course.slug,
            courseTitle: item.course.title,
            percent: item.percent,
          }))}
          suggestions={data.suggestions}
          spaces={data.joinable}
        />
      }
    >
      <div className="space-y-2.5">
        <Composer
          name={viewer.name}
          avatar={viewer.avatar}
          spaces={data.mySpaces}
          defaultSpaceId={data.defaultSpaceId}
          uploadsEnabled={uploadsConfigured()}
        />

        <FeedToolbar sort={sort} basePath="/home" density={density} />

        {data.posts.length === 0 ? (
          <FeedEmpty sort={sort} hasSpaces={data.mySpaces.length > 0} />
        ) : (
          <div className="space-y-2.5">
            {data.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                viewer={viewer}
                density={density}
                canPin={isStaff}
              />
            ))}
          </div>
        )}
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
  return store.get("vu-density")?.value === "compact" ? "compact" : "card";
}

/**
 * Everything the page needs, in one round of parallel queries.
 *
 * Kept out of the component body so the clock is never read during render, and
 * so the page reads as layout rather than data plumbing.
 */
async function loadFeed(userId: string, sort: ReturnType<typeof parseFeedSort>) {
  const runningSince = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const [feed, mySpaces, joinable, events, progress, suggestions] = await Promise.all([
    listFeed({ userId, sort, take: 25 }),
    // Only spaces this member can actually post in.
    prisma.space.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    // Open rooms they have not joined, for the rail.
    prisma.space.findMany({
      where: {
        visibility: { in: ["PUBLIC", "MEMBERS"] },
        memberships: { none: { userId } },
      },
      orderBy: { sortOrder: "asc" },
      take: 4,
      select: {
        id: true,
        name: true,
        slug: true,
        kind: true,
        _count: { select: { memberships: true } },
      },
    }),
    prisma.event.findMany({
      where: { startsAt: { gte: runningSince } },
      orderBy: { startsAt: "asc" },
      take: 2,
      select: { id: true, title: true, startsAt: true, endsAt: true },
    }),
    getContinueLearning(userId),
    peopleYouShouldMeet(userId, 3),
  ]);

  const now = Date.now();

  return {
    posts: feed.posts,
    mySpaces,
    defaultSpaceId:
      mySpaces.find((space) => space.slug === "kitchen-table")?.id ?? mySpaces[0]?.id,
    joinable: joinable.map((space) => ({
      name: space.name,
      slug: space.slug,
      kind: space.kind,
      memberCount: space._count.memberships,
    })),
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      // Live while running, or for an hour after it starts when no end time was
      // set — a class with no endsAt is still a class in progress.
      live:
        event.startsAt.getTime() <= now &&
        (event.endsAt
          ? event.endsAt.getTime() >= now
          : now - event.startsAt.getTime() < 60 * 60 * 1000),
    })),
    progress,
    suggestions,
  };
}
