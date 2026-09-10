import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PostCard } from "@/components/community/post-card";
import { CommentThread, type ThreadComment } from "@/components/community/comment-thread";
import { FeedSortBar } from "@/components/community/feed-sort-bar";
import { nestComments, parseFeedSort } from "@/lib/community/sort";
import { summarizeReactions } from "@/lib/community/reactions";
import { commentAction } from "@/app/(member)/community-actions";

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const { id } = await params;
  const sort = parseFeedSort((await searchParams).sort);
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: { include: { profile: true } },
      space: true,
      attachments: true,
      pollOptions: { include: { _count: { select: { votes: true } } } },
      votes: {
        where: { userId: session.user.id },
        select: { value: true },
      },
      reactions: {
        select: { emoji: true, userId: true },
      },
      comments: {
        include: {
          author: { include: { profile: true } },
          votes: {
            where: { userId: session.user.id },
            select: { value: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { comments: true, bookmarks: true } },
    },
  });
  if (!post || post.status !== "PUBLISHED") notFound();

  const tree = nestComments(
    post.comments.map((comment) => ({
      ...comment,
      myVote: comment.votes[0]?.value ?? 0,
    })),
    sort,
  ) as ThreadComment[];

  const summary = summarizeReactions(post.reactions, session.user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PostCard
        post={{
          ...post,
          myVote: post.votes[0]?.value ?? 0,
          reactionCounts: summary.counts,
          myReaction: summary.myReaction,
          reactionTotal: summary.total,
        }}
        viewer={{
          name: session.user.name || session.user.handle,
          avatar: session.user.image ?? null,
        }}
        preview={false}
      />
      <form action={commentAction} className="flex gap-2">
        <input type="hidden" name="postId" value={post.id} />
        <input
          name="body"
          required
          placeholder="Add a comment"
          className="min-h-11 flex-1 border border-border bg-surface px-4 text-sm"
          style={{ borderRadius: 12 }}
        />
        <button
          type="submit"
          className="min-h-11 bg-foreground px-4 text-sm font-semibold text-primary-foreground"
          style={{ borderRadius: 12 }}
        >
          Comment
        </button>
      </form>
      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">Conversation</h2>
          <FeedSortBar current={sort} basePath={`/posts/${post.id}`} />
        </div>
        <div className="mt-4 space-y-4">
          {tree.length === 0 ? (
            <p className="text-sm text-foreground-muted">No comments yet. Be the first to reply.</p>
          ) : (
            tree.map((comment) => <CommentThread key={comment.id} comment={comment} />)
          )}
        </div>
      </section>
    </div>
  );
}
