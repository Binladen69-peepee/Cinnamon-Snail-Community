"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, CalendarDays, ChefHat, Globe2, Pin } from "lucide-react";
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
  event?: {
    id: string;
    title: string;
    startsAt: string | Date;
    endsAt: string | Date | null;
    location: string | null;
    capacity: number | null;
  } | null;
  recipe?: { id: string; slug: string; title: string } | null;
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
  // The row shows text, not HTML, so it reads the rendered body with its tags
  // removed. Reading `plainText` instead showed raw markdown markers on posts
  // whose stored plain text predates the renderer.
  const compactText = previewText(post.bodyHtml, bodyText);

  /* ---------------------------------------------------------------- compact */
  // A dense list row rather than a shorter card: thumbnail on the left where a
  // list expects it, who-and-where on one line, the text on two, and the
  // actions as a slim strip. The old compact view kept the card's full header
  // and dropped a round thumbnail into a band beneath it, which was neither a
  // card nor a list.
  if (compact) {
    return (
      <>
        <article
          className={cn(
            // No `content-visibility:auto` here: its paint containment clips
            // the overflow menu to a row only ~110px tall, so Delete and
            // Report fell off the bottom. Rows are cheap enough to skip it.
            "group/post rounded-card border bg-surface shadow-e1",
            post.pinnedAt ? "border-brand/40" : "border-border",
          )}
        >
          <div className="flex gap-3 px-4 py-3">
            {hasMedia ? (
              <PostMedia
                items={media}
                compact
                onOpen={openGallery}
                href={`/posts/${post.id}`}
              />
            ) : (
              <Link
                href={`/members/${post.author.handle}`}
                className="shrink-0 rounded-full no-underline"
                aria-label={name}
              >
                <Avatar
                  name={name}
                  src={post.author.profile?.avatarUrl}
                  size="lg"
                  className="size-14 text-body"
                />
              </Link>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 pt-0.5 text-caption text-foreground-muted">
                  <Link
                    href={`/members/${post.author.handle}`}
                    className="truncate text-label font-semibold text-foreground no-underline hover:underline"
                  >
                    {name}
                  </Link>
                  {isHost ? (
                    <BadgeCheck className="size-3.5 shrink-0 text-brand" aria-label="Host" />
                  ) : null}
                  {post.pinnedAt ? (
                    <Pin className="size-3 shrink-0 text-brand" aria-label="Pinned" />
                  ) : null}
                  {showSpace ? (
                    <>
                      <span aria-hidden>·</span>
                      <Link
                        href={`/spaces/${post.space.slug}`}
                        className="truncate text-foreground-muted no-underline hover:text-foreground hover:underline"
                      >
                        {spaceLabel}
                      </Link>
                    </>
                  ) : null}
                  <span aria-hidden>·</span>
                  <time dateTime={stamp.toISOString()} title={stamp.toLocaleString()}>
                    {formatShortTime(stamp)}
                  </time>
                </p>
                <div className="-mr-2 -mt-1.5 shrink-0">
                  <PostOverflow
                    postId={post.id}
                    pinned={Boolean(post.pinnedAt)}
                    canPin={canPin}
                    canDelete={isOwn || canPin}
                  />
                </div>
              </div>

              <Link
                href={`/posts/${post.id}`}
                className="mt-1 block text-body leading-snug text-foreground no-underline"
              >
                {post.title ? (
                  <span className="block truncate font-semibold">{post.title}</span>
                ) : null}
                {compactText ? (
                  <span
                    className={cn(
                      "block",
                      post.title
                        ? "mt-0.5 line-clamp-1 text-foreground-muted"
                        : "line-clamp-2 text-foreground",
                    )}
                  >
                    {compactText}
                  </span>
                ) : post.recipe ? (
                  <span className="block truncate text-foreground-muted">
                    Recipe: {post.recipe.title}
                  </span>
                ) : post.event ? (
                  <span className="block truncate text-foreground-muted">
                    {new Date(post.event.startsAt).toLocaleString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                ) : null}
              </Link>

              <PostFooter
                postId={post.id}
                commentCount={post._count.comments}
                myReaction={post.myReaction ?? null}
                counts={post.reactionCounts ?? {}}
                saved={post.myBookmark ?? false}
                viewer={viewer}
                compact
                previewComments={previewComments}
                totalComments={post._count.comments}
              />
            </div>
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

  return (
    <>
      <article
        className={cn(
          // No `overflow-hidden` and no `content-visibility:auto`: either one
          // clips the overflow menu, and paint containment also traps the
          // menu's fixed dialogs inside the card. Nothing here needs clipping:
          // the media sits between the body and the actions, never on a
          // rounded corner, and the pinned strip rounds its own top.
          "group/post rounded-card border bg-surface shadow-e1",
          post.pinnedAt ? "border-brand/40" : "border-border",
        )}
      >
        {post.pinnedAt ? (
          <p className="flex items-center gap-1.5 rounded-t-[calc(var(--r-card)-1px)] border-b border-separator bg-brand-wash px-4 py-2 text-micro font-semibold uppercase tracking-[0.08em] text-on-brand-wash sm:px-5">
            <Pin className="size-3" aria-hidden />
            Pinned by a host
          </p>
        ) : null}

        {/* Header */}
        <header className="flex items-start gap-3 px-4 pb-2 pt-4 sm:px-5">
          <Link
            href={`/members/${post.author.handle}`}
            className="shrink-0 rounded-full no-underline"
            aria-label={name}
          >
            <Avatar name={name} src={post.author.profile?.avatarUrl} size="sm" />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1">
              <Link
                href={`/members/${post.author.handle}`}
                className="truncate text-label font-semibold text-foreground no-underline hover:underline"
              >
                {name}
              </Link>
              {isHost ? (
                <BadgeCheck
                  className="size-3.5 shrink-0 text-brand"
                  aria-label="Host"
                />
              ) : null}
            </div>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-caption text-foreground-muted">
              <span className="min-w-0 truncate">
                {followerLabel ??
                  (showSpace ? (
                    <Link
                      href={`/spaces/${post.space.slug}`}
                      className="text-foreground-muted no-underline hover:text-foreground hover:underline"
                    >
                      {spaceLabel}
                    </Link>
                  ) : (
                    `@${post.author.handle}`
                  ))}
              </span>
              <span aria-hidden>·</span>
              <time
                dateTime={stamp.toISOString()}
                title={stamp.toLocaleString()}
                className="shrink-0"
              >
                {formatShortTime(stamp)}
              </time>
              <Globe2 className="size-3 shrink-0" aria-hidden />
            </p>
          </div>

          <div className="-mr-1.5 flex shrink-0 items-center gap-1">
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
        <div className="px-4 pb-3 sm:px-5">
          {post.title ? (
            <p className="text-title font-semibold leading-snug text-foreground">
              {post.title}
            </p>
          ) : null}

          {bodyText ? (
            <div className={cn(post.title && "mt-1.5")}>
              <div
                className={cn(
                  "prose-vu text-reading leading-relaxed text-foreground",
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
                  className="mt-1 rounded-chip text-label font-medium text-foreground-muted transition hover:text-foreground"
                >
                  …more
                </button>
              ) : null}
            </div>
          ) : null}

          {/* An event post is about a thing with a time and a place, so the
              time and the place go on the card rather than being buried in
              the body. */}
          {post.event ? (
            <div className="mt-3 flex items-start gap-3 rounded-ctl bg-surface-muted px-3.5 py-3">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0 text-label">
                <p className="font-semibold text-foreground">
                  {new Date(post.event.startsAt).toLocaleString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                {post.event.location ? (
                  <p className="text-foreground-muted">{post.event.location}</p>
                ) : null}
                {post.event.capacity ? (
                  <p className="text-foreground-muted">
                    {post.event.capacity} places
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {post.recipe ? (
            <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-caption font-medium text-foreground-muted">
              <ChefHat className="size-3.5 shrink-0 text-brand" aria-hidden />
              <span className="truncate">Recipe: {post.recipe.title}</span>
            </p>
          ) : null}

          {webLink && !hasMedia ? (
            <a
              href={webLink}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block truncate rounded-ctl border border-border px-3.5 py-2.5 text-label font-medium text-link no-underline transition hover:border-hairline-firm hover:bg-surface-muted"
            >
              {webLink}
            </a>
          ) : null}
        </div>

        {/* Media — full bleed */}
        {hasMedia ? (
          <div className="border-y border-separator">
            <PostMedia
              items={media}
              flush
              onOpen={openGallery}
              href={`/posts/${post.id}`}
            />
          </div>
        ) : null}

        {/* Actions + comments */}
        <div className="px-2 pb-2 sm:px-3">
          <PostFooter
            postId={post.id}
            commentCount={post._count.comments}
            myReaction={post.myReaction ?? null}
            counts={post.reactionCounts ?? {}}
            saved={post.myBookmark ?? false}
            viewer={viewer}
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

/**
 * A post's text for a one-line preview: the rendered body with its tags
 * removed, falling back to the stored plain text. Regex rather than a DOM
 * parse because this runs on the server as well as in the browser.
 */
function previewText(bodyHtml: string | null, plainText: string): string {
  const source = bodyHtml?.trim() ? bodyHtml : plainText;
  return source
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
