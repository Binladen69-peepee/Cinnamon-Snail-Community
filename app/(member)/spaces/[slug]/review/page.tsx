import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { listPendingPosts } from "@/lib/community/posts";
import { getSpaceForMember } from "@/lib/spaces";
import { canModerateSpace } from "@/lib/permissions";
import { getUserAuth } from "@/lib/community/viewer";
import { AppShell } from "@/components/app/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
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
      <div className="space-y-4 pb-10">
        <div>
          <Link
            href={`/spaces/${slug}`}
            className="text-[12.5px] font-semibold text-foreground-muted no-underline hover:text-foreground"
          >
            ← {result.space.name}
          </Link>
          <h1 className="mt-1 font-display text-[1.6rem] font-bold tracking-[-0.02em] text-foreground">
            Posts to review
          </h1>
          <p className="mt-1 text-[14px] text-foreground-muted">
            Nobody else can see these until you let them through.
          </p>
        </div>

        {pending.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            body="New posts in this space will appear here before they go live."
          />
        ) : (
          <ul className="space-y-3">
            {pending.map((post) => (
              <li
                key={post.id}
                className="rounded-card border border-border bg-surface p-4"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar
                    name={post.author.profile?.displayName ?? post.author.handle}
                    src={post.author.profile?.avatarUrl ?? null}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-foreground">
                      {post.author.profile?.displayName ?? post.author.handle}
                    </p>
                    <p className="text-[12px] text-foreground-muted">
                      {formatShortTime(post.createdAt)}
                    </p>
                  </div>
                </div>

                {post.title ? (
                  <h2 className="mt-3 text-[15.5px] font-bold text-foreground">
                    {post.title}
                  </h2>
                ) : null}
                <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground">
                  {post.plainText.slice(0, 900)}
                </p>

                {post.attachments.length > 0 ? (
                  <p className="mt-2 text-[12.5px] text-foreground-muted">
                    {post.attachments.length}{" "}
                    {post.attachments.length === 1 ? "attachment" : "attachments"}
                  </p>
                ) : null}

                <ReviewDecision postId={post.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
