"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, Globe2, Pin } from "lucide-react";
import { formatShortTime } from "@/lib/community/format-count";
import { Avatar } from "@/components/ui/avatar";
import { PostFollowButton } from "@/components/feed/post-follow-button";
import { PostFooter } from "@/components/feed/post-footer";
import { PostGalleryModal } from "@/components/feed/post-gallery-modal";
import { PostMedia } from "@/components/feed/post-media";
import { PostOverflow } from "@/components/feed/post-overflow";
import type { Density } from "@/components/feed/feed-toolbar";
import { videoEmbedSrc } from "@/lib/community/media";
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
    thumbnailUrl?: string | null;
  }[];
  pollOptions: { id: string; label: string; _count: { votes: number } }[];
  _count: { comments: number; bookmarks: number };
  authorFollowerCount?: number;
  viewerFollowsAuthor?: boolean;
};

/**
 * LinkedIn-style feed post: header, body, full-bleed media, reaction summary,
 * and a four-action bar (Like · Comment · Saved · Send).
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
  viewer: { name: string; avatar: string | null; handle?: string };
  density?: Density;
  preview?: boolean;
  canPin?: boolean;
  showSpace?: boolean;
}) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [expanded, setExpanded] = useState(!preview);

  const compact = density === "compact";
  const name = post.author.profile?.displayName ?? post.author.handle;
  const stamp = new Date(post.publishedAt ?? post.createdAt);
  const media = post.attachments.filter((file) =>
    ["image", "gif", "video"].includes(file.kind),
  );
  const hasMedia = media.length > 0;
  const previewComments = post.comments?.slice(0, 2) ?? [];
  const isHost = post.author.handle === "adam";
  const isOwn = Boolean(viewer.handle && viewer.handle === post.author.handle);
  const webLink =
    /^https?:\/\//.test(post.linkUrl ?? "") && !videoEmbedSrc(post.linkUrl ?? "")
      ? post.linkUrl
      : null;
  const spaceLabel = post.space.name.startsWith("#")
    ? post.space.name
    : `# ${post.space.name}`;
  const followerLabel =
    typeof post.authorFollowerCount === "number" && post.authorFollowerCount > 0
      ? `${post.authorFollowerCount.toLocaleString()} followers`
      : null;

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
    pinnedAt: post.pinnedAt,
    _count: { comments: post._count.comments },
  };

  function openGallery(index = 0) {
    if (!hasMedia) return;
    setGalleryIndex(index);
    setGalleryOpen(true);
  }

  const bodyText = post.plainText?.trim() ?? "";
  const longBody = bodyText.length > 180;

  return (
    <>
      <article
        className={cn(
          "group/post overflow-hidden rounded-card border bg-surface shadow-e1 transition-[border-color,box-shadow]",
          post.pinnedAt
            ? "border-brand/40"
            : "border-border hover:border-hairline-firm",
          "[content-visibility:auto]",
          compact
            ? "[contain-intrinsic-size:auto_10rem]"
            : "[contain-intrinsic-size:auto_28rem]",
        )}
      >
        {post.pinnedAt ? (
          <p className="flex items-center gap-1.5 border-b border-brand/20 bg-brand-wash px-4 py-1.5 text-[10.5px] uppercase tracking-[0.12em] text-brand-strong">
            <Pin className="size-2.5" aria-hidden />
            Pinned by a host
          </p>
        ) : null}

        {/* Header */}
        <header className="flex items-start gap-2.5 px-3.5 pb-2 pt-3 sm:px-4">
          <Link
            href={`/members/${post.author.handle}`}
            className="shrink-0 no-underline"
            aria-label={name}
          >
            <Avatar
              name={name}
              src={post.author.profile?.avatarUrl}
              size="sm"
              className="size-12 rounded-[10px] text-[12px]"
            />
          </Link>

          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex flex-wrap items-center gap-x-1">
              <Link
                href={`/members/${post.author.handle}`}
                className="truncate text-[14.5px] font-semibold text-foreground no-underline hover:underline"
              >
                {name}
              </Link>
              {isHost ? (
                <BadgeCheck
                  className="size-3.5 shrink-0 text-link"
                  aria-label="Host"
                />
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-[12.5px] text-foreground-muted">
              {followerLabel ??
                (showSpace ? (
                  <Link
                    href={`/spaces/${post.space.slug}`}
                    className="no-underline hover:text-foreground hover:underline"
                  >
                    {spaceLabel}
                  </Link>
                ) : (
                  `@${post.author.handle}`
                ))}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-foreground-muted">
              <time dateTime={stamp.toISOString()} title={stamp.toLocaleString()}>
                {formatShortTime(stamp)}
              </time>
              <span aria-hidden>·</span>
              <Globe2 className="size-3" aria-hidden />
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {!isOwn ? (
              <PostFollowButton
                handle={post.author.handle}
                initialFollowing={Boolean(post.viewerFollowsAuthor)}
              />
            ) : null}
            <PostOverflow
              postId={post.id}
              pinned={Boolean(post.pinnedAt)}
              canPin={canPin}
              canDelete={isOwn || canPin}
            />
          </div>
        </header>

        {/* Body */}
        <div className="px-3.5 pb-2 sm:px-4">
          {post.title ? (
            <p className="text-[15px] font-semibold leading-snug text-foreground">
              {post.title}
            </p>
          ) : null}

          {bodyText ? (
            <div className={cn(post.title && "mt-1")}>
              <div
                className={cn(
                  "prose-vu text-[14.5px] leading-[1.5] text-foreground [&_a]:text-link",
                  !expanded && longBody && "line-clamp-3",
                )}
                dangerouslySetInnerHTML={{
                  __html: post.bodyHtml || post.plainText,
                }}
              />
              {longBody && !expanded ? (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="mt-0.5 text-[14px] font-semibold text-link hover:underline"
                >
                  …more
                </button>
              ) : null}
            </div>
          ) : null}

          {webLink && !hasMedia ? (
            <a
              href={webLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block truncate rounded-[12px] border border-border bg-mint/30 px-3 py-2.5 text-[13px] text-link no-underline hover:border-hairline-firm"
            >
              {webLink}
            </a>
          ) : null}
        </div>

        {/* Media — full bleed */}
        {hasMedia ? (
          <div className="border-y border-border">
            {compact ? (
              <div className="flex justify-center bg-mint/20 p-3">
                <PostMedia items={media} compact onOpen={openGallery} />
              </div>
            ) : (
              <PostMedia items={media} flush onOpen={openGallery} />
            )}
          </div>
        ) : null}

        {/* Actions + comments */}
        <div className="px-2 pb-1 sm:px-3">
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
      </article>

      {hasMedia ? (
        <PostGalleryModal
          open={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          post={galleryPayload}
          media={media}
          viewer={viewer}
          startIndex={galleryIndex}
          canPin={canPin}
        />
      ) : null}
    </>
  );
}
