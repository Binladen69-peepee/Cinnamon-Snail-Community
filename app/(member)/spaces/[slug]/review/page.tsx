import { notFound, redirect } from "next/navigation";
import { Paperclip, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { listPendingPosts } from "@/lib/community/posts";
import { getSpaceForMember } from "@/lib/spaces";
import { canModerateSpace } from "@/lib/permissions";
import { getUserAuth } from "@/lib/community/viewer";
import { AppShell } from "@/components/app/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/app/ui";
import { ReviewDecision } from "@/app/(member)/spaces/[slug]/review/review-decision";
import { formatShortTime } from "@/lib/community/format-count";

export const metadata = { title: "Posts to review" };

/**
 * The queue a space with approval turned on produces.
 *
 * Without this page the setting is a trap: posts go into PENDING and nobody
 * can ever see them again. Moderators as well as hosts can answer it, because
 * a queue only one person can clear is a queue that stops being cleared.
 */
export default async function SpaceReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const { slug } = await params;
  const result = await getSpaceForMember(session.user.id, slug);
  if (!result) notFound();

  const viewer = await getUserAuth(session.user.id);
  if (!viewer || !canModerateSpace(viewer, result.membership)) notFound();

  const pending = await listPendingPosts({
    userId: session.user.id,
    spaceId: result.space.id,
  });

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Posts to review"
          description="Nobody else can see these until you let them through."
          back={{ href: `/spaces/${slug}`, label: result.space.name }}
        />

        {pending.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title="Nothing waiting"
            description="New posts in this space will appear here before they go live."
            action={
              <ButtonLink href={`/spaces/${slug}`}>Back to {result.space.name}</ButtonLink>
            }
          />
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-separator">
              {pending.map((post) => (
                <li key={post.id} className="px-4 py-4 sm:px-5 sm:py-5">
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
                    <h2 className="mt-3 text-title font-semibold text-foreground">
                      {post.title}
                    </h2>
                  ) : null}
                  <p className="mt-1.5 whitespace-pre-wrap text-reading text-foreground">
                    {post.plainText.slice(0, 900)}
                  </p>

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
