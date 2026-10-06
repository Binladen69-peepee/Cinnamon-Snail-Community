"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, CalendarDays, ChefHat, Megaphone, Pin } from "lucide-react";
import { formatShortTime } from "@/lib/community/format-count";
import { Avatar } from "@/components/ui/avatar";
import { RichText } from "@/components/content/rich-text";
import { BulletinFeedCard } from "@/components/bulletin/feed-card";
import type { BulletinCardData } from "@/lib/bulletin/feed";
import { PostFollowButton } from "@/components/feed/post-follow-button";
import { PostFooter } from "@/components/feed/post-footer";
import { PostGalleryModal } from "@/components/feed/post-gallery-modal";
import { PostMedia } from "@/components/feed/post-media";
import { PostOverflow } from "@/components/feed/post-overflow";
import { PostPoll } from "@/components/feed/post-poll";
import { usePin } from "@/components/feed/use-engagement";
import type { Density } from "@/components/feed/feed-toolbar";
import { videoEmbedSrc } from "@/lib/community/media";
import { cn } from "@/lib/utils";

type PreviewComment = {
  id: string;
  body: string;
  excerpt?: string;
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
};

export type FeedPost = {
  id: string;
  title: string | null;
  /** The stored markdown; rendered through `<RichText>` (C2). */
  body?: string;
  bodyHtml: string | null;
  plainText: string;
  /** Plain text, no markup, for one-line previews. */
  excerpt?: string;
  type: string;
  linkUrl: string | null;
  /** Set when the team made it an announcement. */
  pinnedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  score: number;
  myVote?: number;
  myReaction?: string | null;
  reactionCounts?: Record<string, number>;
  /** Whether the reader has pinned it ("Pin this post"). */
  myBookmark?: boolean;
  myPollOptionId?: string | null;
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
    slug?: string;
    title: string;
    startsAt: string | Date;
    endsAt: string | Date | null;
    location: string | null;
    capacity: number | null;
    status?: string;
  } | null;
  recipe?: { id: string; slug: string; title: string } | null;
  /** The Bulletin Board item behind a BULLETIN post (C3). */
  bulletin?: BulletinCardData | null;
  _count: { comments: number; bookmarks: number };
  authorFollowerCount?: number;
  viewerFollowsAuthor?: boolean;
};

const EVENT_WHEN: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * A post in the Kitchen Table: who and when, what they said, their media, and
 * Like · Comment · Pin underneath.
 *
 * No room label: every general room reads as the Kitchen Table now (DEC-078),
 * so "# Kitchen Table" on every card said nothing. Bodies go through
 * `<RichText>`, which renders markdown and never raw HTML, so bold is bold and
 * a pasted `<script>` is text.
 */
export function PostCard({
  post,
  viewer,
  density = "card",
  preview = true,
  canPin = false,
  pinnedMark = false,
  onPostPage = false,
}: {
  post: FeedPost;
  viewer: { name: string; avatar: string | null; handle?: string };
  density?: Density;
  /** Clamp a long body behind "…more". Off on the post page. */
  preview?: boolean;
  /** Whether the reader may make announcements and remove posts (hosts and staff). */
  canPin?: boolean;
  /**
   * The card sits in the reader's pinned section: mark it "Pinned" for as
   * long as it stays pinned.
   */
  pinnedMark?: boolean;
  /** On the post page, where the conversation is already below the card. */
  onPostPage?: boolean;
  /** Retired: posts no longer carry a room label. Accepted so callers compile. */
  showSpace?: boolean;
}) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [expanded, setExpanded] = useState(!preview);
  const [removed, setRemoved] = useState(false);
  const pin = usePin(post.id, post.myBookmark ?? false);

  if (removed) return null;

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
  const followerLabel =
    typeof post.authorFollowerCount === "number" && post.authorFollowerCount > 0
      ? `${post.authorFollowerCount.toLocaleString()} ${post.authorFollowerCount === 1 ? "follower" : "followers"}`
      : null;
  const body = post.body ?? post.plainText;
  const excerpt = (post.excerpt ?? post.plainText ?? "").trim();
  const longBody = excerpt.length > 280 || (body.match(/\n/g)?.length ?? 0) > 4;
  const bulletin = post.bulletin ?? null;
  const strip: "pinned" | "announcement" | null =
    pinnedMark && pin.pinned ? "pinned" : post.pinnedAt ? "announcement" : null;

  const galleryPayload = {
    id: post.id,
    title: post.title,
    body: post.body,
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

  const overflow = (
    <PostOverflow
      postId={post.id}
      pinned={Boolean(post.pinnedAt)}
      canPin={canPin}
      // A Bulletin Board post is taken down by a host, or withdrawn on the
      // board; its author cannot delete it from the feed (lib/community/posts).
      canDelete={bulletin ? canPin : isOwn || canPin}
      canReport={!isOwn}
      onDeleted={() => setRemoved(true)}
    />
  );

  const gallery = hasMedia ? (
    <PostGalleryModal
      open={galleryOpen}
      onClose={() => setGalleryOpen(false)}
      post={galleryPayload}
      media={media}
      viewer={viewer}
      startIndex={galleryIndex}
      canPin={canPin}
    />
  ) : null;

  /* ---------------------------------------------------------------- compact */
  // A dense list row rather than a shorter card: thumbnail on the left where a
  // list expects it, who-and-when on one line, the text on two, and the
  // actions as a slim strip.
  if (compact) {
    const rowText = bulletin ? bulletin.summary || bulletin.title : excerpt;
    const rowTitle = bulletin ? bulletin.title : post.title;
    return (
      <>
        <article
          aria-label={rowTitle || `Post by ${name}`}
          className={cn(
            // No `content-visibility:auto` here: its paint containment clips
            // the overflow menu to a row only ~110px tall.
            "group/post rounded-card border bg-surface shadow-e1",
            strip ? "border-brand/40" : "border-border",
          )}
        >
          <div className="flex gap-3 px-4 py-3">
            {hasMedia ? (
              <PostMedia items={media} compact onOpen={openGallery} href={`/posts/${post.id}`} />
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
                  {strip === "pinned" ? (
                    <Pin className="size-3 shrink-0 text-brand" aria-label="Pinned" />
                  ) : strip === "announcement" ? (
                    <Megaphone className="size-3 shrink-0 text-brand" aria-label="Announcement" />
                  ) : null}
                  <span aria-hidden>·</span>
                  <time dateTime={stamp.toISOString()} title={stamp.toLocaleString()}>
                    {formatShortTime(stamp)}
                  </time>
                </p>
                <div className="-mr-2 -mt-1.5 shrink-0">{overflow}</div>
              </div>

              <Link
                href={`/posts/${post.id}`}
                className="mt-1 block text-body leading-snug text-foreground no-underline"
              >
                {rowTitle ? <span className="block truncate font-semibold">{rowTitle}</span> : null}
                {rowText ? (
                  <span
                    className={cn(
                      "block",
                      rowTitle ? "mt-0.5 line-clamp-1 text-foreground-muted" : "line-clamp-2 text-foreground",
                    )}
                  >
                    {rowText}
                  </span>
                ) : post.recipe ? (
                  <span className="block truncate text-foreground-muted">
                    Recipe: {post.recipe.title}
                  </span>
                ) : post.event ? (
                  <span className="block truncate text-foreground-muted">
                    {new Date(post.event.startsAt).toLocaleString(undefined, EVENT_WHEN)}
                  </span>
                ) : null}
              </Link>

              <PostFooter
                postId={post.id}
                commentCount={post._count.comments}
                myReaction={post.myReaction ?? null}
                counts={post.reactionCounts ?? {}}
                pinned={post.myBookmark ?? false}
                viewer={viewer}
                compact
                onPostPage={onPostPage}
                previewComments={previewComments}
                totalComments={post._count.comments}
              />
            </div>
          </div>
        </article>
        {gallery}
      </>
    );
  }

  return (
    <>
      <article
        aria-label={post.title || bulletin?.title || `Post by ${name}`}
        className={cn(
          // No `overflow-hidden` and no `content-visibility:auto`: either one
          // clips the overflow menu, and paint containment also traps the
          // menu's fixed dialogs inside the card.
          "group/post rounded-card border bg-surface shadow-e1",
          strip ? "border-brand/40" : "border-border",
        )}
      >
        {strip ? (
          <p className="flex items-center gap-1.5 rounded-t-[calc(var(--r-card)-1px)] border-b border-separator bg-brand-wash px-4 py-2 text-micro font-semibold uppercase tracking-[0.08em] text-on-brand-wash sm:px-5">
            {strip === "pinned" ? (
              <>
                <Pin className="size-3" aria-hidden />
                Pinned
                <span className="font-medium normal-case tracking-normal opacity-80">
                  · only you see your pins
                </span>
              </>
            ) : (
              <>
                <Megaphone className="size-3" aria-hidden />
                Announcement
              </>
            )}
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
                <BadgeCheck className="size-3.5 shrink-0 text-brand" aria-label="Host" />
              ) : null}
            </div>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-caption text-foreground-muted">
              <span className="min-w-0 truncate">{followerLabel ?? `@${post.author.handle}`}</span>
              <span aria-hidden>·</span>
              <Link
                href={`/posts/${post.id}`}
                className="shrink-0 text-foreground-muted no-underline hover:text-foreground hover:underline"
              >
                <time dateTime={stamp.toISOString()} title={stamp.toLocaleString()}>
                  {formatShortTime(stamp)}
                </time>
              </Link>
            </p>
          </div>

          <div className="-mr-1.5 flex shrink-0 items-center gap-1">
            {!isOwn ? (
              <PostFollowButton
                handle={post.author.handle}
                initialFollowing={Boolean(post.viewerFollowsAuthor)}
              />
            ) : null}
            {overflow}
          </div>
        </header>

        {/* Body */}
        <div className="px-4 pb-3 sm:px-5">
          {bulletin ? (
            // A Bulletin Board item: the item itself is the content, and its
            // reactions and comments are this post's (DEC-078).
            <BulletinFeedCard data={bulletin} />
          ) : (
            <>
              {post.title ? (
                <p className="text-title font-semibold leading-snug text-foreground">
                  {post.title}
                </p>
              ) : null}

              {body.trim() ? (
                <div className={cn(post.title && "mt-1.5")}>
                  <RichText
                    body={body}
                    className={cn(
                      "text-reading leading-relaxed text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0",
                      !expanded && longBody && "line-clamp-4",
                    )}
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
            </>
          )}

          {/* A live class is a thing with a time and a place, so the time and
              the place go on the card rather than being buried in the body. */}
          {post.event ? (
            <div className="mt-3 flex items-start gap-3 rounded-ctl bg-surface-muted px-3.5 py-3">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0 flex-1 text-label">
                <p className="font-semibold text-foreground">
                  {new Date(post.event.startsAt).toLocaleString(undefined, EVENT_WHEN)}
                  {post.event.status === "CANCELED" ? (
                    <span className="ml-2 font-medium text-danger">Canceled</span>
                  ) : null}
                </p>
                {post.event.location ? (
                  <p className="text-foreground-muted">{post.event.location}</p>
                ) : null}
                {post.event.capacity ? (
                  <p className="text-foreground-muted">{post.event.capacity} places</p>
                ) : null}
              </div>
              {post.event.slug ? (
                <Link
                  href={`/live-classes/${post.event.slug}`}
                  className="shrink-0 rounded-chip text-label font-medium text-link no-underline hover:underline"
                >
                  Details
                </Link>
              ) : null}
            </div>
          ) : null}

          {post.pollOptions.length > 0 ? (
            <PostPoll
              postId={post.id}
              options={post.pollOptions}
              myOptionId={post.myPollOptionId ?? null}
            />
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
              rel="noopener noreferrer nofollow"
              className="mt-3 block truncate rounded-ctl border border-border px-3.5 py-2.5 text-label font-medium text-link no-underline transition hover:border-hairline-firm hover:bg-surface-muted"
            >
              {webLink}
            </a>
          ) : null}
        </div>

        {/* Media — full bleed */}
        {hasMedia ? (
          <div className="border-y border-separator">
            <PostMedia items={media} flush onOpen={openGallery} href={`/posts/${post.id}`} />
          </div>
        ) : null}

        {/* Actions + comments */}
        <div className="px-2 pb-2 sm:px-3">
          <PostFooter
            postId={post.id}
            commentCount={post._count.comments}
            myReaction={post.myReaction ?? null}
            counts={post.reactionCounts ?? {}}
            pinned={post.myBookmark ?? false}
            viewer={viewer}
            onPostPage={onPostPage}
            previewComments={previewComments}
            totalComments={post._count.comments}
          />
        </div>
      </article>
      {gallery}
    </>
  );
}
