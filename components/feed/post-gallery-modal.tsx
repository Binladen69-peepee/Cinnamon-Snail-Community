"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Pin,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { RichText } from "@/components/content/rich-text";
import { servableImageUrl } from "@/lib/media/servable-image";
import { CommentThread, type ThreadComment } from "@/components/feed/comment-thread";
import { PostMenu } from "@/components/feed/post-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { usePin, useReaction } from "@/components/feed/use-engagement";
import { formatCount, formatShortTime } from "@/lib/community/format-count";
import type { MediaItem } from "@/components/feed/post-media";
import { videoEmbedSrc, videoPosterUrl } from "@/lib/community/media";
import { useIsMobile } from "@/components/hooks/use-media-query";
import { backdropClass, dialogClass } from "@/components/app/ui";
import { DEFAULT_REACTION } from "@/lib/community/reactions";
import { cn } from "@/lib/utils";

export type GalleryPost = {
  id: string;
  title: string | null;
  /** The stored markdown, rendered through `<RichText>`. Older callers omit it. */
  body?: string;
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
  pinnedAt?: Date | string | null;
  _count: { comments: number };
};

type GalleryProps = {
  open: boolean;
  onClose: () => void;
  post: GalleryPost;
  media: MediaItem[];
  viewer: { name: string; avatar: string | null };
  startIndex?: number;
  canPin?: boolean;
};

/**
 * Instagram-style post view: large dimmed overlay, media left, sticky header /
 * scrollable caption+comments / sticky actions+composer on the right.
 *
 * Mounted only while open, and keyed by the post it is showing, so every open
 * starts from the post's own counts. Resetting that state from an effect
 * instead would render one frame of the previous post's numbers.
 */
/**
 * The lightbox, on screens with room for one.
 *
 * It refuses to open on a phone. An overlay that covers the whole screen hides
 * the post it belongs to and costs a second gesture to leave, so the phone
 * shows its media in place instead — see `PostMedia`. Checking here as well as
 * at the call site means no future caller can reintroduce it by accident.
 */
export function PostGalleryModal(props: GalleryProps) {
  const isMobile = useIsMobile();
  if (isMobile || !props.open || props.media.length === 0) return null;
  return <GalleryDialog key={`${props.post.id}:${props.startIndex ?? 0}`} {...props} />;
}

function GalleryDialog({
  onClose,
  post,
  media,
  viewer,
  startIndex = 0,
  canPin = false,
}: GalleryProps) {
  const titleId = useId();
  const composerRef = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, startIndex), Math.max(0, media.length - 1)),
  );
  const [comments, setComments] = useState<ThreadComment[] | null>(null);
  const [commentCount, setCommentCount] = useState(post._count.comments);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The same pin and reaction the card shows: one post, not two copies of it.
  const reaction = useReaction(post.id, post.myReaction ?? null, post.reactionCounts ?? {});
  const pin = usePin(post.id, Boolean(post.myBookmark));
  const liked = reaction.mine !== null;

  const name = post.author.profile?.displayName ?? post.author.handle;
  const stamp = new Date(post.publishedAt ?? post.createdAt);
  const current = media[index] ?? media[0];
  const body = (post.body ?? post.plainText ?? "").trim();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (media.length > 1 && event.key === "ArrowLeft") {
        setIndex((value) => (value - 1 + media.length) % media.length);
      }
      if (media.length > 1 && event.key === "ArrowRight") {
        setIndex((value) => (value + 1) % media.length);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, media.length]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/community/posts/${post.id}/comments`)
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("load")),
      )
      .then((data: { comments: ThreadComment[]; count: number }) => {
        if (!alive) return;
        setComments(data.comments);
        setCommentCount(data.count);
      })
      .catch(() => {
        if (alive) setError("Could not load comments.");
      });
    return () => {
      alive = false;
    };
  }, [post.id]);

  function prev() {
    setIndex((value) => (value - 1 + media.length) % media.length);
  }

  function next() {
    setIndex((value) => (value + 1) % media.length);
  }

  async function reloadComments() {
    try {
      const response = await fetch(`/api/community/posts/${post.id}/comments`);
      if (!response.ok) return;
      const data = (await response.json()) as {
        comments: ThreadComment[];
        count: number;
      };
      setComments(data.comments);
      setCommentCount(data.count);
    } catch {
      // Keep the list we have.
    }
  }

  function toggleLike() {
    reaction.setReaction(liked ? null : DEFAULT_REACTION);
  }

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    startTransition(async () => {
      const response = await fetch(`/api/community/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        setError("Could not post that comment.");
        return;
      }
      const payload = (await response.json()) as {
        comments: ThreadComment[];
        count: number;
      };
      form.reset();
      setComments(payload.comments);
      setCommentCount(payload.count);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={cn(backdropClass, "z-80 flex items-center justify-center p-0 sm:p-6")}
      onClick={onClose}
    >
      {/* Close outside the card, Instagram-style. A surface chip rather than a
          bare white glyph, so it reads on the light veil as well as the dark. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-81 grid size-10 place-items-center rounded-full border border-border bg-overlay text-foreground shadow-e2 transition hover:bg-surface-muted"
      >
        <X className="size-5" aria-hidden />
      </button>

      <div
        className={cn(
          dialogClass,
          "flex h-full w-full max-w-295 flex-col overflow-hidden sm:h-[min(90dvh,860px)] lg:flex-row",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Left: media */}
        <div className="relative flex min-h-[40dvh] flex-[1.35] items-center justify-center bg-black lg:min-h-0">
          {media.length > 1 ? (
            <>
              <button
                type="button"
                onClick={prev}
                aria-label="Previous"
                className="absolute left-3 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow-e2 transition hover:scale-105"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={next}
                aria-label="Next"
                className="absolute right-3 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow-e2 transition hover:scale-105"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
              <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                {media.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={`Image ${i + 1}`}
                    onClick={() => setIndex(i)}
                    className={cn(
                      "size-1.5 rounded-full transition",
                      i === index ? "bg-brand" : "bg-white/45",
                    )}
                  />
                ))}
              </div>
            </>
          ) : null}

          {current?.kind === "video" ? (
            videoEmbedSrc(current.url) ? (
              <iframe
                key={current.id}
                src={`${videoEmbedSrc(current.url)}?autoplay=1&rel=0&playsinline=1`}
                title={current.alt || "Class video"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="aspect-video h-auto max-h-full w-full max-w-full border-0"
              />
            ) : (
              <video
                key={current.id}
                src={current.url}
                poster={videoPosterUrl(current.url, current.thumbnailUrl) ?? undefined}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full object-contain"
              />
            )
          ) : current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={current.id}
              src={servableImageUrl(current.url, 2000)}
              alt={current.alt ?? ""}
              className="max-h-full max-w-full object-contain"
            />
          ) : null}
        </div>

        {/* Right: Instagram sidebar */}
        <aside className="flex w-full shrink-0 flex-col border-t border-border lg:w-100 lg:border-l lg:border-t-0">
          {/* Sticky header */}
          <header className="flex shrink-0 items-center gap-3 border-b border-separator px-4 py-3">
            <Link
              href={`/members/${post.author.handle}`}
              className="shrink-0 rounded-full no-underline"
            >
              <Avatar
                name={name}
                src={post.author.profile?.avatarUrl}
                size="sm"
                className="size-8 text-micro"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <p id={titleId} className="truncate text-label font-semibold text-foreground">
                <Link
                  href={`/members/${post.author.handle}`}
                  className="text-foreground no-underline hover:underline"
                >
                  {name}
                </Link>
              </p>
              <Link
                href={`/posts/${post.id}`}
                className="block truncate text-caption text-foreground-muted no-underline hover:text-foreground hover:underline"
              >
                <time dateTime={stamp.toISOString()}>{formatShortTime(stamp)}</time>
                <span aria-hidden> · </span>
                Open post
              </Link>
            </div>
            {/* Only the team's announcement control here; report and delete
                live on the card and the post page. */}
            <PostMenu
              postId={post.id}
              pinned={Boolean(post.pinnedAt)}
              canPin={canPin}
              canReport={false}
            />
          </header>

          {/* Scrollable caption + comments */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {(post.title || body) && (
              <div className="mb-5 flex gap-3 border-b border-separator pb-5">
                <Link
                  href={`/members/${post.author.handle}`}
                  className="shrink-0 rounded-full no-underline"
                >
                  <Avatar
                    name={name}
                    src={post.author.profile?.avatarUrl}
                    size="sm"
                    className="size-8 text-micro"
                  />
                </Link>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-body leading-relaxed text-foreground">
                    <Link
                      href={`/members/${post.author.handle}`}
                      className="mr-1.5 font-semibold text-foreground no-underline hover:underline"
                    >
                      {name}
                    </Link>
                    {post.title ? (
                      <span className="font-semibold">{post.title} </span>
                    ) : null}
                  </p>
                  {body ? (
                    <RichText
                      body={body}
                      className="mt-1 text-body leading-relaxed text-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0"
                    />
                  ) : null}
                  <p className="mt-2 text-caption text-foreground-muted">
                    <time dateTime={stamp.toISOString()}>
                      {formatShortTime(stamp)}
                    </time>
                  </p>
                </div>
              </div>
            )}

            {comments === null && !error ? (
              <div className="space-y-4" aria-busy>
                {[0, 1, 2].map((row) => (
                  <div key={row} className="flex gap-3">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-28 rounded-chip" />
                      <Skeleton className="h-3 w-full rounded-chip" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {error ? (
              <p className="text-label font-medium text-danger" role="alert">
                {error}
              </p>
            ) : null}

            {comments?.length === 0 ? (
              <p className="py-6 text-center text-body text-foreground-muted">
                No comments yet.
              </p>
            ) : null}

            {comments ? (
              <ul className="space-y-4">
                {comments.map((comment) => (
                  <li key={comment.id}>
                    <CommentThread
                      comment={comment}
                      onPosted={reloadComments}
                      anchor={false}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Sticky actions + likes + composer */}
          <footer className="shrink-0 border-t border-separator">
            <div className="flex items-center gap-0.5 px-2.5 pt-2">
              <IconBtn
                label={liked ? "Remove your reaction" : "Like"}
                onClick={toggleLike}
                active={liked}
                activeClass="text-highlight hover:text-highlight"
              >
                <Heart
                  className="size-5"
                  fill={liked ? "currentColor" : "none"}
                  aria-hidden
                />
              </IconBtn>
              <IconBtn
                label="Comment"
                onClick={() => composerRef.current?.focus()}
              >
                <MessageCircle className="size-5" aria-hidden />
              </IconBtn>
              <div className="ml-auto">
                <IconBtn
                  label={pin.pinned ? "Unpin this post" : "Pin this post"}
                  onClick={pin.toggle}
                  active={pin.pinned}
                  activeClass="text-brand hover:text-brand"
                >
                  <Pin
                    className="size-5"
                    fill={pin.pinned ? "currentColor" : "none"}
                    aria-hidden
                  />
                </IconBtn>
              </div>
            </div>

            <div className="px-4 pb-3 pt-1">
              <p className="text-label font-semibold text-foreground">
                {reaction.total > 0
                  ? `${formatCount(reaction.total)} ${reaction.total === 1 ? "reaction" : "reactions"}`
                  : "Be the first to react"}
              </p>
              <p className="mt-0.5 text-caption text-foreground-muted">
                <time dateTime={stamp.toISOString()}>
                  {stamp.toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year:
                      stamp.getFullYear() === new Date().getFullYear()
                        ? undefined
                        : "numeric",
                  })}
                </time>
                {commentCount > 0 ? (
                  <span>
                    {" "}
                    · {formatCount(commentCount)} comments
                  </span>
                ) : null}
              </p>
            </div>

            <form
              onSubmit={submitComment}
              className="flex items-center gap-2.5 border-t border-separator px-4 py-2.5"
            >
              <Avatar
                name={viewer.name}
                src={viewer.avatar}
                size="sm"
                className="size-7 text-micro"
              />
              <input
                ref={composerRef}
                name="body"
                required
                maxLength={5000}
                aria-label="Add a comment"
                placeholder="Add a comment…"
                disabled={pending}
                className="min-w-0 flex-1 border-0 bg-transparent py-2 text-body text-foreground outline-none placeholder:text-field-placeholder disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={pending}
                className="shrink-0 rounded-ctl px-2 py-1.5 text-label font-semibold text-brand-strong transition hover:bg-surface-muted disabled:opacity-50"
              >
                {pending ? "…" : "Post"}
              </button>
            </form>
          </footer>
        </aside>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  active,
  activeClass = "text-foreground",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-10 place-items-center rounded-ctl text-foreground-muted transition hover:bg-surface-muted hover:text-foreground",
        active && activeClass,
      )}
    >
      {children}
    </button>
  );
}
