import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listFeed } from "@/lib/community/posts";
import { PostCard } from "@/components/community/post-card";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedSortBar } from "@/components/community/feed-sort-bar";
import { parseFeedSort } from "@/lib/community/sort";
import Link from "next/link";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const sort = parseFeedSort((await searchParams).sort);
  const { posts } = await listFeed({ userId: session.user.id, sort, take: 60 });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FeedSortBar current={sort} basePath="/home" />
          <Link
            href="/compose"
            className="inline-flex h-8 items-center bg-foreground px-4 text-sm font-semibold text-primary-foreground"
            style={{ borderRadius: 12 }}
          >
            Create post
          </Link>
        </div>
        <div className="mt-4 space-y-3">
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
      </div>
      <aside className="hidden space-y-4 xl:block">
        <div className="vu-card vu-card-hover p-5">
          <h2 className="text-lg font-extrabold tracking-tight text-foreground">Continue learning</h2>
          <p className="mt-2 text-sm text-foreground-muted">
            Course playback arrives in Phase 3. Your progress will live here.
          </p>
        </div>
        <div className="vu-card vu-card-hover p-5">
          <h2 className="text-lg font-extrabold tracking-tight text-foreground">People nearby in spirit</h2>
          <p className="mt-2 text-sm text-foreground-muted">
            Matching comes later. For now, browse the member directory.
          </p>
          <Link href="/members" className="mt-3 inline-block text-sm text-accent">
            Meet members
          </Link>
        </div>
      </aside>
    </div>
  );
}
