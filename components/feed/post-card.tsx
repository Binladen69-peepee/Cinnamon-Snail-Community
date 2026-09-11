import Link from "next/link";
import { BadgeCheck, Pin } from "lucide-react";
import { formatShortTime } from "@/lib/community/format-count";
import { PostFooter } from "@/components/feed/post-footer";
import { PostMedia } from "@/components/feed/post-media";
import { PostMenu } from "@/components/feed/post-menu";
import { VoteRail } from "@/components/feed/vote-rail";
import { SPACE_KIND_ICON } from "@/lib/spaces/kinds";
import type { Density } from "@/components/feed/feed-toolbar";
import { cn } from "@/lib/utils";

type PreviewComment = {
  id: string;
  body: string;
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
};

export type FeedPost = {
  id: string;
  title: string | null;
  bodyHtml: string | null;
  plainText: string;
  type: string;
  linkUrl: string | null;
  pinnedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  score: number;
  myVote?: number;
  myReaction?: string | null;
  reactionCounts?: Record<string, number>;
  myBookmark?: boolean;
  comments?: PreviewComment[];
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
  space: { name: string; slug: string; kind?: string };
  attachments: {
    id: string;
    url: string;
    alt: string | null;
    kind: string;
    width?: number | null;
    height?: number | null;
  }[];
  pollOptions: { id: string; label: string; _count: { votes: number } }[];
  _count: { comments: number; bookmarks: number };
};

/**
 * A feed post.
 *
 * Reddit's anatomy: the vote rail down the left, then a meta line naming the
 * space before the author, then the title as the loudest thing in the card.
 * Space before author is deliberate and is the opposite of Twitter — in a
 * community you are reading a room first and a person second.
 *
 * Compact density drops the media to a right-hand thumbnail and tightens the
 * padding, which roughly doubles what fits on a screen. Card density gives the
 * photograph its full width, which is what a plate of food deserves.
 */
export function PostCard({
  post,
  viewer,
  density = "card",
  preview = true,
  canPin = false,
  showSpace = true,
}: {
  post: FeedPost;
  viewer: { name: string; avatar: string | null };
  density?: Density;
  preview?: boolean;
  canPin?: boolean;
  showSpace?: boolean;
}) {
  const compact = density === "compact";
  const name = post.author.profile?.displayName ?? post.author.handle;
  const stamp = post.publishedAt ?? post.createdAt;
  const media = post.attachments.filter((file) =>
    ["image", "gif", "video"].includes(file.kind),
  );
  const previewComments = compact ? [] : (post.comments?.slice(0, 2) ?? []);
  const isHost = post.author.handle === "adam";
  // Lesson discussion posts hold an internal "vu:lesson:<id>" reference here,
  // which is not something to show a member as a link.
  const webLink = /^https?:\/\//.test(post.linkUrl ?? "") ? post.linkUrl : null;
  const SpaceIcon =
    SPACE_KIND_ICON[(post.space.kind ?? "FEED") as keyof typeof SPACE_KIND_ICON];

  return (
    <article
      className={cn(
        "group/post overflow-hidden rounded-card border bg-surface transition-colors",
        post.pinnedAt ? "border-brand/40" : "border-border hover:border-hairline-firm",
        // The browser skips layout and paint for cards that are offscreen.
        "[content-visibility:auto]",
        compact ? "[contain-intrinsic-size:auto_7rem]" : "[contain-intrinsic-size:auto_24rem]",
      )}
    >
      {post.pinnedAt ? (
        <p className="flex items-center gap-1.5 border-b border-brand/20 bg-brand-wash px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-strong">
          <Pin className="size-2.5" aria-hidden />
          Pinned by a host
        </p>
      ) : null}

      <div className={cn("flex gap-1.5", compact ? "p-2" : "p-2.5")}>
        <VoteRail postId={post.id} score={post.score} myVote={post.myVote ?? 0} />

        <div className="min-w-0 flex-1">
          {/* Meta line: room, then person, then when. */}
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-[12.5px] leading-tight text-foreground-muted">
              {showSpace ? (
                <>
                  <Link
                    href={`/spaces/${post.space.slug}`}
                    className="inline-flex items-center gap-1 font-bold text-foreground no-underline hover:text-brand hover:underline"
                  >
                    {SpaceIcon ? <SpaceIcon className="size-3" aria-hidden /> : null}
                    {post.space.name}
                  </Link>
                  <span aria-hidden> · </span>
                </>
              ) : null}
              <Link
                href={`/members/${post.author.handle}`}
                className="font-semibold text-foreground-muted no-underline hover:underline"
              >
                {name}
              </Link>
              {isHost ? (
                <BadgeCheck
                  className="ml-0.5 inline size-3.5 -translate-y-px text-brand"
                  aria-label="Host"
                />
              ) : null}
              <span aria-hidden> · </span>
              <Link
                href={`/posts/${post.id}`}
                className="text-foreground-muted no-underline hover:underline"
              >
                <time dateTime={stamp.toISOString()} title={stamp.toLocaleString()}>
                  {formatShortTime(stamp)}
                </time>
              </Link>
            </p>
            <PostMenu
              postId={post.id}
              pinned={Boolean(post.pinnedAt)}
              canPin={canPin}
            />
          </div>

          <div className={cn(compact && "flex items-start gap-2.5")}>
            <div className="min-w-0 flex-1">
              {post.title ? (
                <h2
                  className={cn(
                    "mt-0.5 font-display font-bold leading-[1.25] tracking-[-0.015em] text-foreground",
                    compact ? "text-[15px]" : "text-[17px]",
                  )}
                >
                  <Link
                    href={`/posts/${post.id}`}
                    className="no-underline hover:underline"
                  >
                    {post.title}
                  </Link>
                </h2>
              ) : null}

              {post.plainText ? (
                <div
                  className={cn(
                    "prose-vu mt-1 text-[14px] leading-[1.55] text-foreground-muted [&_a]:text-brand",
                    preview ? (compact ? "line-clamp-2" : "line-clamp-4") : "[&_p]:mb-3",
                  )}
                  dangerouslySetInnerHTML={{ __html: post.bodyHtml || post.plainText }}
                />
              ) : null}
            </div>

            {compact ? (
              <PostMedia items={media} postId={post.id} compact />
            ) : null}
          </div>

          {!compact ? <PostMedia items={media} postId={post.id} /> : null}

          {!compact && webLink ? (
            <a
              href={webLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block truncate rounded-ctl border border-border bg-mint/40 px-3 py-2 text-[13px] font-semibold text-brand-strong no-underline transition hover:border-brand"
            >
              {webLink}
            </a>
          ) : null}

          <PostFooter
            postId={post.id}
            commentCount={post._count.comments}
            myReaction={post.myReaction ?? null}
            counts={post.reactionCounts ?? {}}
            saved={post.myBookmark ?? false}
            viewer={viewer}
            compact={compact}
            previewComments={previewComments}
            totalComments={post._count.comments}
          />
        </div>
      </div>
    </article>
  );
}
