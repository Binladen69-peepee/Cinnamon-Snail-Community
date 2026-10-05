import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseCommentSort } from "@/lib/community/sort";
import { formatShortTime } from "@/lib/community/format-count";
import {
  getPostConversation,
  getPostDetail,
  listMoreFromSpace,
} from "@/lib/community/post-detail";
import { SPACE_KIND_ICON } from "@/lib/spaces/kinds";
import { AppShell } from "@/components/app/app-shell";
import { Card, CardHeader } from "@/components/app/ui";
import { PostCard } from "@/components/feed/post-card";
import { RecipeVariations } from "@/components/feed/recipe-variations";
import { listVariations } from "@/lib/recipes/variations";
import { Conversation } from "@/components/feed/conversation";
import { CommentSort } from "@/components/feed/comment-sort";
import { CommentComposer } from "@/components/feed/comment-composer";
import { SpaceRail } from "@/components/spaces/space-rail";

/**
 * One post, and its conversation.
 *
 * The same card the feed uses renders the post, with `preview={false}` so the
 * body is not clamped — one component, so a post cannot look like two different
 * things depending on where you met it.
 */
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
  const sort = parseCommentSort((await searchParams).sort);

  const detail = await getPostDetail(session.user.id, id);
  // Not found and not-allowed are the same answer: saying "this exists but you
  // cannot see it" leaks the existence of a private room's conversation.
  if (!detail) notFound();

  const { post, canModerate, joined } = detail;

  const [conversation, more, hosts] = await Promise.all([
    getPostConversation(session.user.id, post.id, sort),
    listMoreFromSpace(post.spaceId, post.id),
    prisma.spaceMembership.findMany({
      where: { spaceId: post.spaceId, role: { in: ["HOST", "MODERATOR"] } },
      take: 5,
      select: {
        role: true,
        user: {
          select: {
            handle: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
    }),
  ]);

  const space = await prisma.space.findUnique({
    where: { id: post.spaceId },
    select: {
      name: true,
      description: true,
      kind: true,
      visibility: true,
      postingPermission: true,
      resources: { orderBy: { sortOrder: "asc" } },
      _count: { select: { memberships: true, posts: true } },
    },
  });

  const viewer = {
    name: session.user.name || session.user.handle,
    avatar: session.user.image ?? null,
    handle: session.user.handle,
  };
  const SpaceIcon =
    SPACE_KIND_ICON[(post.space.kind ?? "FEED") as keyof typeof SPACE_KIND_ICON];

  return (
    <AppShell
      rail={
        space ? (
          <div className="flex flex-col gap-4">
            <SpaceRail
              space={space}
              resources={space.resources}
              members={hosts.map((row) => ({
                handle: row.user.handle,
                role: row.role,
                profile: row.user.profile,
              }))}
            />
            {more.length > 0 ? (
              <Card padding="none" className="overflow-hidden">
                <CardHeader title={`More in ${space.name}`} />
                <ul className="divide-y divide-separator">
                  {more.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/posts/${item.id}`}
                        className="block px-4 py-3 no-underline transition hover:bg-surface-muted"
                      >
                        <span className="line-clamp-2 text-label font-medium leading-snug text-foreground">
                          {item.title || item.plainText.slice(0, 70)}
                        </span>
                        <span className="mt-1 flex items-center gap-2.5 text-caption text-foreground-muted">
                          <span className="tabular-nums">{item.score} points</span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <MessageSquare className="size-3" aria-hidden />
                            {item.commentCount}
                          </span>
                          <span>
                            {formatShortTime(item.publishedAt ?? item.createdAt)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {/* Back to the room rather than browser-back: someone arriving from a
            permalink has nothing to go back to. */}
        <Link
          href={`/spaces/${post.space.slug}`}
          className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-ctl px-1 text-label font-medium text-foreground-muted no-underline transition hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {SpaceIcon ? <SpaceIcon className="size-3.5" aria-hidden /> : null}
          {post.space.name}
        </Link>

        {/* The post's title is a line inside the card, so the page's heading
            is spoken rather than shown. */}
        <h1 className="sr-only">{post.title || `Post in ${post.space.name}`}</h1>

        <PostCard
          post={post}
          viewer={viewer}
          density="card"
          preview={false}
          canPin={canModerate}
        />

        {post.recipeId ? (
          <RecipeVariations
            recipeId={post.recipeId}
            postId={post.id}
            variations={await listVariations(post.recipeId, session.user.id)}
          />
        ) : null}

        {/* The conversation is one card: the reply box, the count and its
            order, then the thread. */}
        <Card padding="none" className="divide-y divide-separator">
          <div className="px-4 py-4 sm:px-5">
            <CommentComposer postId={post.id} viewer={viewer} joined={joined} />
          </div>

          <div className="px-4 py-3 sm:px-5">
            <CommentSort
              current={sort}
              postId={post.id}
              count={conversation.count}
            />
          </div>

          <div className="px-4 py-5 sm:px-5">
            <Conversation
              comments={conversation.comments}
              postId={post.id}
              viewer={viewer}
            />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
