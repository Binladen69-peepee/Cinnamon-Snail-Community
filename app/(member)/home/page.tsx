import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { listFeed } from "@/lib/community/posts";
import { PostCard } from "@/components/community/post-card";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedSortBar } from "@/components/community/feed-sort-bar";
import { parseFeedSort } from "@/lib/community/sort";
import { StoriesRail } from "@/components/community/stories-rail";
import { FeedComposer } from "@/components/community/feed-composer";
import { FeedRail } from "@/components/community/feed-rail";
import { recentRecognition } from "@/lib/social/badges";
import { peopleYouShouldMeet } from "@/lib/social/suggestions";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const sort = parseFeedSort((await searchParams).sort);
  const [
    { posts },
    spaces,
    memberCount,
    eventPosts,
    recentComments,
    storyPosts,
    recognition,
    suggestions,
  ] = await Promise.all([
      listFeed({ userId: session.user.id, sort, take: 60 }),
      prisma.space.findMany({
        orderBy: { sortOrder: "asc" },
        select: {
          name: true,
          slug: true,
          coverUrl: true,
          description: true,
          _count: { select: { memberships: true } },
        },
      }),
      prisma.user.count({ where: { deletedAt: null, status: { not: "DELETED" } } }),
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
      prisma.post.findMany({
        where: {
          status: "PUBLISHED",
          attachments: { some: { kind: { in: ["image", "gif"] } } },
        },
        orderBy: { publishedAt: "desc" },
        take: 8,
        distinct: ["authorId"],
        select: {
          id: true,
          author: {
            select: {
              handle: true,
              profile: { select: { displayName: true, avatarUrl: true } },
            },
          },
          attachments: {
            where: { kind: { in: ["image", "gif"] } },
            take: 1,
            select: { url: true },
          },
        },
      }),
      recentRecognition(4),
      peopleYouShouldMeet(session.user.id, 3),
    ]);

  const recognitionItems = recognition.map((award) => ({
    id: award.id,
    icon: award.badge.icon ?? "🌱",
    badgeName: award.badge.name,
    reason: award.reason ?? award.badge.description,
    memberName: award.user.profile?.displayName ?? award.user.handle,
    handle: award.user.handle,
    avatar: award.user.profile?.avatarUrl ?? null,
  }));
  const suggestionItems = suggestions.map((person) => ({
    userId: person.userId,
    displayName: person.displayName,
    handle: person.handle,
    avatarUrl: person.avatarUrl,
    reason: person.reason,
  }));

  const kitchen = spaces.find((space) => space.slug === "kitchen-table") ?? spaces[0];
  const currentName = session.user.name || session.user.handle;

  return (
    <div className="flex gap-5">
      <div className="min-w-0 flex-1 space-y-5">
        <StoriesRail
          currentUser={{ name: currentName, avatar: session.user.image ?? null }}
          stories={storyPosts.map((post) => ({
            id: post.id,
            name: post.author.profile?.displayName ?? post.author.handle,
            href: `/posts/${post.id}`,
            image: post.attachments[0]?.url ?? null,
            avatar: post.author.profile?.avatarUrl ?? null,
            unseen: true,
          }))}
        />
        <FeedComposer name={currentName} avatar={session.user.image ?? null} />
        <FeedSortBar current={sort} basePath="/home" />
        <div className="space-y-5">
          {posts.length === 0 ? (
            <EmptyState
              title="The table is set"
              body="No posts yet in spaces you can see. Start the first conversation."
              actionLabel="Create a post"
              actionHref="/compose"
            />
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>
        <div className="space-y-5 xl:hidden">
          <FeedRail
            stacked
            community={{
              name: kitchen?.name ?? "Vegan University",
              description: kitchen?.description ?? null,
              coverUrl: kitchen?.coverUrl ?? null,
            }}
            memberCount={memberCount}
            spaces={spaces.map((space) => ({
              name: space.name,
              slug: space.slug,
              coverUrl: space.coverUrl,
              memberCount: space._count.memberships,
            }))}
            events={eventPosts.map((event) => ({
              id: event.id,
              title: event.title,
              publishedAt: event.publishedAt,
              spaceName: event.space.name,
            }))}
            activity={recentComments.map((item) => ({
              id: item.id,
              body: item.body,
              createdAt: item.createdAt,
              authorName: item.author.profile?.displayName ?? item.author.handle,
              avatar: item.author.profile?.avatarUrl ?? null,
            }))}
            recognition={recognitionItems}
            suggestions={suggestionItems}
          />
        </div>
      </div>
      <div className="hidden xl:block">
        <FeedRail
          community={{
            name: kitchen?.name ?? "Vegan University",
            description: kitchen?.description ?? null,
            coverUrl: kitchen?.coverUrl ?? null,
          }}
          memberCount={memberCount}
          spaces={spaces.map((space) => ({
            name: space.name,
            slug: space.slug,
            coverUrl: space.coverUrl,
            memberCount: space._count.memberships,
          }))}
          events={eventPosts.map((event) => ({
            id: event.id,
            title: event.title,
            publishedAt: event.publishedAt,
            spaceName: event.space.name,
          }))}
          activity={recentComments.map((item) => ({
            id: item.id,
            body: item.body,
            createdAt: item.createdAt,
            authorName: item.author.profile?.displayName ?? item.author.handle,
            avatar: item.author.profile?.avatarUrl ?? null,
          }))}
          recognition={recognitionItems}
          suggestions={suggestionItems}
        />
      </div>
    </div>
  );
}
