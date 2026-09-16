import Link from "next/link";
import { BadgeCheck, Pin } from "lucide-react";
import { formatShortTime } from "@/lib/community/format-count";
import { Avatar } from "@/components/ui/avatar";
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
 * Modern social-style feed post: avatar header, 12px card, vote rail, actions.
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
  const previewComments = post.comments?.slice(0, 2) ?? [];
  const isHost = post.author.handle === "adam";
  const webLink = /^https?:\/\//.test(post.linkUrl ?? "") ? post.linkUrl : null;
  const SpaceIcon =
    SPACE_KIND_ICON[(post.space.kind ?? "FEED") as keyof typeof SPACE_KIND_ICON];

  const galleryPayload = {
    id: post.id,
    title: post.title,
    bodyHtml: post.bodyHtml,
    plainText: post.plainText,
    score: post.score,
    myVote: post.myVote,
    myReaction: post.myReaction,
    reactionCounts: post.reactionCounts,
    myBookmark: post.myBookmark,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    author: post.author,
    space: { name: post.space.name, slug: post.space.slug },
    _count: { comments: post._count.comments },
  };

  return (
    <article
      className={cn(
        "group/post overflow-hidden rounded-card border bg-surface shadow-e1 transition-[border-color,box-shadow]",
        post.pinnedAt
          ? "border-brand/40"
          : "border-border hover:border-hairline-firm hover:shadow-e2",
        "[content-visibility:auto]",
        compact ? "[contain-intrinsic-size:auto_8rem]" : "[contain-intrinsic-size:auto_24rem]",
      )}
    >
      {post.pinnedAt ? (
        <p className="flex items-center gap-1.5 border-b border-brand/20 bg-brand-wash px-3.5 py-1.5 text-[10.5px] uppercase tracking-[0.12em] text-brand-strong">
          <Pin className="size-2.5" aria-hidden />
          Pinned by a host
        </p>
      ) : null}

      <div className={cn("flex", compact ? "gap-2 p-3" : "gap-3 p-3.5")}>
        <VoteRail postId={post.id} score={post.score} myVote={post.myVote ?? 0} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2.5">
            <Link
              href={`/members/${post.author.handle}`}
              className="shrink-0 no-underline"
              aria-label={name}
            >
              <Avatar
                name={name}
                src={post.author.profile?.avatarUrl}
                size="sm"
                className={cn(compact ? "size-8 text-[10px]" : "size-9 text-[11px]")}
              />
            </Link>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[13.5px] text-foreground">
                    <Link
                      href={`/members/${post.author.handle}`}
                      className="truncate no-underline hover:underline"
                    >
                      {name}
                    </Link>
                    {isHost ? (
                      <BadgeCheck
                        className="size-3.5 shrink-0 text-brand"
                        aria-label="Host"
                      />
                    ) : null}
                    <span className="text-foreground-muted">·</span>
                    <Link
                      href={`/posts/${post.id}`}
                      className="shrink-0 text-[12.5px] text-foreground-muted no-underline hover:underline"
                    >
                      <time dateTime={stamp.toISOString()} title={stamp.toLocaleString()}>
                        {formatShortTime(stamp)}
                      </time>
                    </Link>
                  </p>
                  {showSpace ? (
                    <Link
                      href={`/spaces/${post.space.slug}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-foreground-muted no-underline hover:text-brand hover:underline"
                    >
                      {SpaceIcon ? <SpaceIcon className="size-3" aria-hidden /> : null}
                      {post.space.name.startsWith("#")
                        ? post.space.name
                        : `# ${post.space.name}`}
                    </Link>
                  ) : null}
                </div>
                <PostMenu
                  postId={post.id}
                  pinned={Boolean(post.pinnedAt)}
                  canPin={canPin}
                />
              </div>
            </div>
          </div>

          <div className={cn("mt-2", compact && "flex items-start gap-3")}>
            <div className="min-w-0 flex-1">
              {post.title ? (
                <p
                  className={cn(
                    "leading-[1.3] tracking-[-0.015em] text-foreground",
                    compact ? "text-[15px]" : "text-[16.5px]",
                  )}
                >
                  <Link
                    href={`/posts/${post.id}`}
                    className="no-underline hover:underline"
                  >
                    {post.title}
                  </Link>
                </p>
              ) : null}

              {post.plainText ? (
                <div
                  className={cn(
                    "prose-vu text-[14.5px] leading-[1.55] text-foreground [&_a]:text-brand",
                    post.title ? "mt-1" : null,
                    preview ? (compact ? "line-clamp-2" : "line-clamp-5") : "[&_p]:mb-3",
                  )}
                  dangerouslySetInnerHTML={{ __html: post.bodyHtml || post.plainText }}
                />
              ) : null}
            </div>

            {compact ? (
              <PostMedia
                items={media}
                postId={post.id}
                compact
                galleryPost={galleryPayload}
                viewer={viewer}
              />
            ) : null}
          </div>

          {!compact ? (
            <PostMedia
              items={media}
              postId={post.id}
              galleryPost={galleryPayload}
              viewer={viewer}
            />
          ) : null}

          {!compact && webLink ? (
            <a
              href={webLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2.5 block truncate rounded-card border border-border bg-mint/40 px-3 py-2.5 text-[13px] text-brand-strong no-underline transition hover:border-brand"
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
