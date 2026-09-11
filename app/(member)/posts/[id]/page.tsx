import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseFeedSort } from "@/lib/community/sort";
import { formatShortTime } from "@/lib/community/format-count";
import {
  getPostConversation,
  getPostDetail,
  listMoreFromSpace,
} from "@/lib/community/post-detail";
import { SPACE_KIND_ICON } from "@/lib/spaces/kinds";
import { AppShell } from "@/components/app/app-shell";
import { PostCard } from "@/components/feed/post-card";
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
  const sort = parseFeedSort((await searchParams).sort);

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
  };
  const SpaceIcon =
    SPACE_KIND_ICON[(post.space.kind ?? "FEED") as keyof typeof SPACE_KIND_ICON];

  return (
    <AppShell
      rail={
        space ? (
          <div className="space-y-2.5">
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
              <section className="rounded-card border border-border bg-surface p-2.5">
                <h2 className="mb-2 px-1.5 text-[10.5px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
                  More in {space.name}
                </h2>
                <ul className="space-y-0.5">
                  {more.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/posts/${item.id}`}
                        className="-mx-1.5 block rounded-ctl px-1.5 py-1.5 no-underline transition hover:bg-mint"
                      >
                        <span className="line-clamp-2 text-[12.5px] font-bold leading-snug text-foreground">
                          {item.title || item.plainText.slice(0, 70)}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-foreground-muted">
                          <span className="tabular-nums">{item.score} points</span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <MessageSquare className="size-2.5" aria-hidden />
                            {item._count.comments}
                          </span>
                          <span>
                            {formatShortTime(item.publishedAt ?? item.createdAt)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-2.5">
        {/* Back to the room rather than browser-back: someone arriving from a
            permalink has nothing to go back to. */}
        <Link
          href={`/spaces/${post.space.slug}`}
          className="inline-flex items-center gap-1.5 px-1 text-[13px] font-bold text-foreground-muted no-underline transition hover:text-brand"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {SpaceIcon ? <SpaceIcon className="size-3.5" aria-hidden /> : null}
          {post.space.name}
        </Link>

        <PostCard
          post={post}
          viewer={viewer}
          density="card"
          preview={false}
          canPin={canModerate}
        />

        <CommentComposer postId={post.id} viewer={viewer} joined={joined} />

        <CommentSort
          current={sort}
          postId={post.id}
          count={conversation.count}
        />

        <Conversation
          comments={conversation.comments}
          postId={post.id}
          viewer={viewer}
        />
      </div>
    </AppShell>
  );
}
