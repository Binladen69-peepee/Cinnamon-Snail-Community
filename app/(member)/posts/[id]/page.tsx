import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { auth } from "@/auth";
import { parseCommentSort } from "@/lib/community/sort";
import { formatShortTime } from "@/lib/community/format-count";
import {
  DETAIL_ROOTS_MAX,
  DETAIL_ROOTS_PER_PAGE,
  getPostConversation,
  getPostDetail,
  listMoreFromKitchenTable,
  parseCommentId,
  parseRootsLimit,
} from "@/lib/community/post-detail";
import { AppShell } from "@/components/app/app-shell";
import { Callout, Card, CardHeader } from "@/components/app/ui";
import { PostCard } from "@/components/feed/post-card";
import { RecipeVariations } from "@/components/feed/recipe-variations";
import { listVariations } from "@/lib/recipes/variations";
import { reviveFeedCard } from "@/lib/community/feed-card";
import { Conversation } from "@/components/feed/conversation";
import { CommentSort } from "@/components/feed/comment-sort";
import { CommentComposer } from "@/components/feed/comment-composer";
import { loadBulletinCards } from "@/lib/bulletin/feed";

// Generic on purpose: a private post's title must not leak through the tab name.
export const metadata = { title: "Post" };

/**
 * One post, and its conversation.
 *
 * The same card the feed uses renders the post, with `preview={false}` so the
 * body is not clamped — one component, so a post cannot look like two
 * different things depending on where you met it.
 *
 * A link to one comment (`#comment-<id>`, C4) lands on it: the conversation
 * opens the thread that holds it and scrolls there, and asks for that thread
 * with `?comment=<id>` when it is beyond the first page.
 */
export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; comment?: string; roots?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const userId = session.user.id;

  const { id } = await params;
  const query = await searchParams;
  const sort = parseCommentSort(query.sort);
  const focusId = parseCommentId(query.comment);
  const roots = parseRootsLimit(query.roots);

  const detail = await getPostDetail(userId, id);
  // Not found and not-allowed are the same answer: saying "this exists but you
  // cannot see it" leaks the existence of a private room's conversation.
  if (!detail) notFound();

  const { post, context } = detail;

  // An idea lives on the Ideas board, with its votes and status (DEC-078).
  // Reply and mention notifications, search hits and profile activity still
  // point here, so they are sent on, keeping the comment they were about.
  if (post.type === "IDEA") {
    redirect(`/ideas/${post.id}${focusId ? `?comment=${encodeURIComponent(focusId)}` : ""}`);
  }
  // A bulletin post shows its Bulletin Board item here too, as in the feed.
  const bulletinCard =
    post.type === "BULLETIN"
      ? ((await loadBulletinCards([post.id], userId)).get(post.id) ?? null)
      : null;

  const [conversation, more, variations] = await Promise.all([
    getPostConversation(userId, post.id, sort, { focusId, roots }),
    listMoreFromKitchenTable(userId, post.id),
    detail.recipeId ? listVariations(detail.recipeId, userId) : Promise.resolve(null),
  ]);

  const viewer = {
    name: session.user.name || session.user.handle,
    avatar: session.user.image ?? null,
    handle: session.user.handle,
  };

  const moreHref =
    conversation.hasMore && roots < DETAIL_ROOTS_MAX
      ? `/posts/${post.id}?${new URLSearchParams({
          ...(sort !== "top" ? { sort } : {}),
          roots: String(roots + DETAIL_ROOTS_PER_PAGE),
        })}`
      : null;

  return (
    <AppShell
      rail={
        more.length > 0 ? (
          <Card padding="none" className="overflow-hidden">
            <CardHeader title="More from the Kitchen Table" />
            <ul className="divide-y divide-separator">
              {more.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/posts/${item.id}`}
                    className="block px-4 py-3 no-underline transition hover:bg-surface-muted"
                  >
                    <span className="line-clamp-2 text-label font-medium leading-snug text-foreground">
                      {item.title || item.excerpt.slice(0, 90) || "A post"}
                    </span>
                    <span className="mt-1 flex items-center gap-2.5 text-caption text-foreground-muted">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <MessageSquare className="size-3" aria-hidden />
                        {item.commentCount}
                        <span className="sr-only">
                          {item.commentCount === 1 ? "reply" : "replies"}
                        </span>
                      </span>
                      <span>{formatShortTime(item.publishedAt ?? item.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {/* Back to where the post lives rather than browser-back: someone
            arriving from a permalink has nothing to go back to. */}
        <Link
          href={context.href}
          className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-ctl px-1 text-label font-medium text-foreground-muted no-underline transition hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {context.label}
        </Link>

        {/* The post's title is a line inside the card, so the page's heading
            is spoken rather than shown. */}
        <h1 className="sr-only">{post.title || post.excerpt.slice(0, 80) || "Post"}</h1>

        {detail.status !== "PUBLISHED" ? (
          <Callout tone="info">
            {detail.status === "PENDING"
              ? "This post is waiting for a host. Only you and the hosts can see it."
              : detail.status === "SCHEDULED"
                ? "This post is scheduled. Only you can see it until it goes live."
                : "This post is not published. Only you and the hosts can see it."}
          </Callout>
        ) : null}

        <PostCard
          post={{ ...reviveFeedCard(post), bulletin: bulletinCard ?? post.bulletin ?? null }}
          viewer={viewer}
          density="card"
          preview={false}
          canPin={detail.canModerate}
          onPostPage
        />

        {detail.recipeId && variations ? (
          <RecipeVariations recipeId={detail.recipeId} postId={post.id} variations={variations} />
        ) : null}

        {/* The conversation is one card: the reply box, the count and its
            order, then the thread. */}
        <Card padding="none" className="divide-y divide-separator">
          <div className="px-4 py-4 sm:px-5">
            <CommentComposer postId={post.id} viewer={viewer} canReply={detail.canReply} />
          </div>

          <div className="px-4 py-3 sm:px-5">
            <CommentSort current={sort} postId={post.id} count={conversation.count} />
          </div>

          <div className="px-4 py-5 sm:px-5">
            <Conversation
              comments={conversation.comments}
              postId={post.id}
              focusRequested={focusId}
              moreHref={moreHref}
            />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
