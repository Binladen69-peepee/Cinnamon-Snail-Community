import { notFound, redirect } from "next/navigation";
import { Paperclip, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listPendingPosts } from "@/lib/community/posts";
import { getSpaceForMember } from "@/lib/spaces";
import { canModerateSpace, isStaff } from "@/lib/permissions";
import { getUserAuth } from "@/lib/community/viewer";
import { kitchenTableReviewSpaces } from "@/lib/community/kitchen-table";
import { KITCHEN_TABLE_PATH, KITCHEN_TABLE_SLUG } from "@/lib/community/system-spaces";
import { AppShell } from "@/components/app/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { RichText } from "@/components/content/rich-text";
import { ButtonLink, Card, EmptyState, Overline, PageHeader } from "@/components/app/ui";
import { ReviewDecision } from "@/app/(member)/spaces/[slug]/review/review-decision";
import { formatShortTime } from "@/lib/community/format-count";

export const metadata = { title: "Posts to review" };

/**
 * The queue a room with approval turned on produces.
 *
 * Without this page the setting is a trap: posts go into PENDING and nobody
 * can ever see them again. Moderators as well as hosts can answer it, because
 * a queue only one person can clear is a queue that stops being cleared.
 *
 * The Kitchen Table's queue is every general room this person moderates
 * (DEC-078): the retired rooms have no page of their own any more, and a post
 * held in one of them must not be stranded.
 */
export default async function SpaceReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const userId = session.user.id;

  const { slug } = await params;
  const [result, viewer] = await Promise.all([
    getSpaceForMember(userId, slug),
    getUserAuth(userId),
  ]);
  if (!result) {
    // Review notifications sent before they used the slug carry the space id.
    const byId = await prisma.space.findUnique({ where: { id: slug }, select: { slug: true } });
    if (byId) redirect(`/spaces/${byId.slug}/review`);
  }
  if (!result || !viewer) notFound();

  const isTable = slug === KITCHEN_TABLE_SLUG;
  const rooms = isTable
    ? await kitchenTableReviewSpaces(userId)
    : canModerateSpace(viewer, result.membership)
      ? [{ id: result.space.id, slug: result.space.slug, name: result.space.name }]
      : [];
  // Someone who cannot answer the queue gets a 404: that it exists is itself
  // information about the room.
  if (rooms.length === 0) notFound();

  const lists = await Promise.all(
    rooms.map(async (room) => {
      const posts = await listPendingPosts({ userId, spaceId: room.id }).catch(() => []);
      return posts.map((post) => ({ ...post, roomName: room.name }));
    }),
  );
  const pending = lists
    .flat()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const severalRooms = rooms.length > 1;

  const back =
    isTable || !isStaff(viewer)
      ? { href: KITCHEN_TABLE_PATH, label: "Kitchen Table" }
      : { href: "/admin/spaces", label: "Spaces" };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Posts to review"
          description="Nobody else can see these until you let them through."
          back={back}
        />

        {pending.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title="Nothing waiting"
            description="Posts held for review appear here before they go live."
            action={<ButtonLink href={back.href}>Back to {back.label}</ButtonLink>}
          />
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-separator">
              {pending.map((post) => (
                <li key={post.id} className="px-4 py-4 sm:px-5 sm:py-5">
                  {severalRooms ? <Overline className="mb-2">{post.roomName}</Overline> : null}
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={post.author.profile?.displayName ?? post.author.handle}
                      src={post.author.profile?.avatarUrl ?? null}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-body font-semibold text-foreground">
                        {post.author.profile?.displayName ?? post.author.handle}
                      </p>
                      <p className="text-caption text-foreground-muted">
                        {formatShortTime(post.createdAt)}
                      </p>
                    </div>
                  </div>

                  {post.title ? (
                    <h2 className="mt-3 text-title font-semibold text-foreground">{post.title}</h2>
                  ) : null}
                  {post.body.trim() ? (
                    <RichText
                      body={post.body}
                      className="mt-1.5 text-reading leading-relaxed text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0"
                    />
                  ) : null}

                  {post.attachments.length > 0 ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-caption text-foreground-muted">
                      <Paperclip className="size-3.5" aria-hidden />
                      {post.attachments.length}{" "}
                      {post.attachments.length === 1 ? "attachment" : "attachments"}
                    </p>
                  ) : null}

                  <ReviewDecision postId={post.id} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
