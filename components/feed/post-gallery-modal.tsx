"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CommentPanel } from "@/components/feed/comment-panel";
import { PostActions } from "@/components/feed/post-actions";
import { VoteRail } from "@/components/feed/vote-rail";
import { formatShortTime } from "@/lib/community/format-count";
import type { MediaItem } from "@/components/feed/post-media";
import { cn } from "@/lib/utils";

export type GalleryPost = {
  id: string;
  title: string | null;
  bodyHtml: string | null;
  plainText: string;
  score: number;
  myVote?: number;
  myReaction?: string | null;
  reactionCounts?: Record<string, number>;
  myBookmark?: boolean;
  publishedAt: Date | string | null;
  createdAt: Date | string;
  author: {
    handle: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
  space: { name: string; slug: string };
  _count: { comments: number };
};

/**
 * Multi-image post lightbox: slideshow on the left, post details + comments
 * on the right (stacked on small screens).
 */
export function PostGalleryModal({
  open,
  onClose,
  post,
  media,
  viewer,
  startIndex = 0,
}: {
  open: boolean;
  onClose: () => void;
  post: GalleryPost;
  media: MediaItem[];
  viewer: { name: string; avatar: string | null };
  startIndex?: number;
}) {
  const titleId = useId();
  const [index, setIndex] = useState(startIndex);
  const [commentCount, setCommentCount] = useState(post._count.comments);
  const name = post.author.profile?.displayName ?? post.author.handle;
  const stamp = new Date(post.publishedAt ?? post.createdAt);
  const current = media[index] ?? media[0];

  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(0, startIndex), media.length - 1));
  }, [open, startIndex, media.length]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") {
        setIndex((value) => (value - 1 + media.length) % media.length);
      }
      if (event.key === "ArrowRight") {
        setIndex((value) => (value + 1) % media.length);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, media.length]);

  if (!open || !current) return null;

  function prev() {
    setIndex((value) => (value - 1 + media.length) % media.length);
  }

  function next() {
    setIndex((value) => (value + 1) % media.length);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-background shadow-e3 sm:h-[min(92vh,880px)] sm:rounded-card lg:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Slideshow */}
        <div className="relative flex min-h-[42vh] flex-1 items-center justify-center bg-black lg:min-h-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-black/50 text-white transition hover:bg-black/70 lg:hidden"
          >
            <X className="size-4" aria-hidden />
          </button>

          {media.length > 1 ? (
            <>
              <button
                type="button"
                onClick={prev}
                aria-label="Previous image"
                className="absolute left-2 top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white transition hover:bg-black/70"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="Next image"
                className="absolute right-2 top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white transition hover:bg-black/70"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </>
          ) : null}

          {current.kind === "video" ? (
            <video
              key={current.id}
              src={current.url}
              controls
              playsInline
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={current.id}
              src={current.url}
              alt={current.alt ?? ""}
              className="max-h-full max-w-full object-contain"
            />
          )}

          {media.length > 1 ? (
            <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2.5 py-1 text-[12px] tabular-nums text-white">
              {index + 1} / {media.length}
            </p>
          ) : null}
        </div>

        {/* Details + comments */}
        <aside className="flex w-full shrink-0 flex-col border-t border-border bg-surface lg:w-[380px] lg:border-l lg:border-t-0">
          <div className="flex items-start gap-2.5 border-b border-border px-4 py-3">
            <Link
              href={`/members/${post.author.handle}`}
              className="shrink-0 no-underline"
            >
              <Avatar
                name={name}
                src={post.author.profile?.avatarUrl}
                size="sm"
                className="size-9 text-[11px]"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <p id={titleId} className="truncate text-[14px] font-semibold text-foreground">
                <Link
                  href={`/members/${post.author.handle}`}
                  className="no-underline hover:underline"
                >
                  {name}
                </Link>
              </p>
              <p className="truncate text-[12px] text-foreground-muted">
                <Link
                  href={`/spaces/${post.space.slug}`}
                  className="no-underline hover:text-brand hover:underline"
                >
                  {post.space.name.startsWith("#")
                    ? post.space.name
                    : `# ${post.space.name}`}
                </Link>
                <span aria-hidden> · </span>
                <time dateTime={stamp.toISOString()}>{formatShortTime(stamp)}</time>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="hidden size-8 place-items-center rounded-full text-foreground-muted transition hover:bg-mint hover:text-foreground lg:grid"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {post.title ? (
              <p className="text-[16px] leading-snug text-foreground">{post.title}</p>
            ) : null}
            {post.plainText ? (
              <div
                className={cn(
                  "prose-vu text-[14px] leading-[1.55] text-foreground [&_a]:text-brand",
                  post.title && "mt-1.5",
                )}
                dangerouslySetInnerHTML={{ __html: post.bodyHtml || post.plainText }}
              />
            ) : null}

            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              <VoteRail
                postId={post.id}
                score={post.score}
                myVote={post.myVote ?? 0}
                layout="row"
              />
            </div>

            <div className="mt-1">
              <PostActions
                postId={post.id}
                commentCount={commentCount}
                myReaction={post.myReaction ?? null}
                counts={post.reactionCounts ?? {}}
                saved={post.myBookmark ?? false}
                commentsOpen
              />
            </div>

            <CommentPanel
              postId={post.id}
              open
              viewer={viewer}
              onCountChange={setCommentCount}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
