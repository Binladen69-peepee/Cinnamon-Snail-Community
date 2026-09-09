import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listFeed } from "@/lib/community/posts";
import { PostCard } from "@/components/community/post-card";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedSortBar } from "@/components/community/feed-sort-bar";
import { canEnterSpace } from "@/lib/permissions";
import { getUserAuth } from "@/lib/community/posts";
import { parseFeedSort } from "@/lib/community/sort";
import Link from "next/link";

export default async function SpacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const { slug } = await params;
  const sort = parseFeedSort((await searchParams).sort);
  const space = await prisma.space.findUnique({ where: { slug } });
  if (!space) notFound();
  const authUser = await getUserAuth(session.user.id);
  const membership = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId: space.id, userId: session.user.id } },
  });
  if (!authUser || !canEnterSpace(authUser, space, membership)) {
    return (
      <EmptyState
        title="This space is private"
        body="You do not have access to this kitchen yet. Ask a host if you believe you should."
      />
    );
  }
  const { posts } = await listFeed({
    userId: session.user.id,
    spaceId: space.id,
    sort,
    take: 60,
  });
  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{space.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-foreground-muted">{space.description}</p>
        </div>
        <Link
          href="/compose"
          className="inline-flex h-8 shrink-0 items-center bg-foreground px-4 text-sm font-semibold text-primary-foreground"
          style={{ borderRadius: 12 }}
        >
          Create post
        </Link>
      </div>
      <div className="mt-4">
        <FeedSortBar current={sort} basePath={`/spaces/${space.slug}`} />
      </div>
      <div className="mt-4 space-y-3">
        {posts.length === 0 ? (
          <EmptyState
            title="Quiet for now"
            body="Be the first to post in this space."
            actionLabel="Write a post"
            actionHref="/compose"
          />
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </div>
    </div>
  );
}
