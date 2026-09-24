"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Share2,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CommentThread, type ThreadComment } from "@/components/feed/comment-thread";
import { PostMenu } from "@/components/feed/post-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { reactAction, saveAction } from "@/app/(member)/community-actions";
import { runAction } from "@/components/feed/run-action";
import { formatCount, formatShortTime } from "@/lib/community/format-count";
import type { MediaItem } from "@/components/feed/post-media";
import { videoEmbedSrc, videoPosterUrl } from "@/lib/community/media";
import { useIsMobile } from "@/components/hooks/use-media-query";
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
  pinnedAt?: Date | string | null;
  _count: { comments: number };
};

import { DEFAULT_REACTION } from "@/lib/community/reactions";

const LIKE = DEFAULT_REACTION;

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
  const [liked, setLiked] = useState(Boolean(post.myReaction));
  const [likes, setLikes] = useState(
    Object.values(post.reactionCounts ?? {}).reduce((sum, n) => sum + n, 0),
  );
  const [saved, setSaved] = useState(Boolean(post.myBookmark));
  const [pending, startTransition] = useTransition();

  const name = post.author.profile?.displayName ?? post.author.handle;
  const stamp = new Date(post.publishedAt ?? post.createdAt);
  const current = media[index] ?? media[0];
  const spaceLabel = post.space.name.startsWith("#")
    ? post.space.name
    : `# ${post.space.name}`;

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
    const clearing = liked;
    const data = new FormData();
    data.set("postId", post.id);
    data.set("emoji", LIKE);
    startTransition(async () => {
      setLiked(!clearing);
      setLikes((value) => Math.max(0, value + (clearing ? -1 : 1)));
      await runAction(reactAction, data);
    });
  }

  function toggleSave() {
    const data = new FormData();
    data.set("postId", post.id);
    startTransition(async () => {
      setSaved((value) => !value);
      await runAction(saveAction, data);
    });
  }

  async function share() {
    const url = new URL(`/posts/${post.id}`, window.location.origin).toString();
    if (navigator.share) {
      await navigator.share({ url, title: name }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-0 sm:p-6"
      onClick={onClose}
    >
      {/* Close outside the card, Instagram-style */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-[81] grid size-10 place-items-center rounded-full text-white transition hover:bg-white/10"
      >
        <X className="size-6" strokeWidth={1.75} aria-hidden />
      </button>

      <div
        className="flex h-full w-full max-w-[1180px] flex-col overflow-hidden bg-background shadow-e3 sm:h-[min(90vh,860px)] sm:rounded-[12px] lg:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Left: media */}
        <div className="relative flex min-h-[40vh] flex-[1.35] items-center justify-center bg-black lg:min-h-0">
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
              src={current.url}
              alt={current.alt ?? ""}
              className="max-h-full max-w-full object-contain"
            />
          ) : null}
        </div>

        {/* Right: Instagram sidebar */}
        <aside className="flex w-full shrink-0 flex-col border-t border-border bg-surface lg:w-[400px] lg:border-l lg:border-t-0">
          {/* Sticky header */}
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
            <Link
              href={`/members/${post.author.handle}`}
              className="shrink-0 no-underline"
            >
              <Avatar
                name={name}
                src={post.author.profile?.avatarUrl}
                size="sm"
                className="size-8 text-[10px]"
              />
            </Link>
            <div className="min-w-0 flex-1 leading-tight">
              <p id={titleId} className="truncate text-[14px] font-semibold text-foreground">
                <Link
                  href={`/members/${post.author.handle}`}
                  className="no-underline hover:underline"
                >
                  {name}
                </Link>
              </p>
              <Link
                href={`/spaces/${post.space.slug}`}
                className="truncate text-[12px] text-foreground-muted no-underline hover:underline"
              >
                {spaceLabel}
              </Link>
            </div>
            <PostMenu
              postId={post.id}
              pinned={Boolean(post.pinnedAt)}
              canPin={canPin}
            />
          </header>

          {/* Scrollable caption + comments */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {(post.title || post.plainText) && (
              <div className="mb-4 flex gap-3">
                <Link
                  href={`/members/${post.author.handle}`}
                  className="shrink-0 no-underline"
                >
                  <Avatar
                    name={name}
                    src={post.author.profile?.avatarUrl}
                    size="sm"
                    className="size-8 text-[10px]"
                  />
                </Link>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[14px] leading-[1.45] text-foreground">
                    <Link
                      href={`/members/${post.author.handle}`}
                      className="mr-1.5 font-semibold no-underline hover:underline"
                    >
                      {name}
                    </Link>
                    {post.title ? (
                      <span className="font-semibold">{post.title} </span>
                    ) : null}
                  </p>
                  {post.plainText ? (
                    <div
                      className="prose-vu mt-1 text-[14px] leading-[1.45] text-foreground [&_a]:text-brand"
                      dangerouslySetInnerHTML={{
                        __html: post.bodyHtml || post.plainText,
                      }}
                    />
                  ) : null}
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-foreground-muted">
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
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}

            {comments?.length === 0 ? (
              <p className="py-6 text-center text-[14px] text-foreground-muted">
                No comments yet.
              </p>
            ) : null}

            {comments ? (
              <ul className="space-y-4">
                {comments.map((comment) => (
                  <li key={comment.id}>
                    <CommentThread comment={comment} onPosted={reloadComments} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Sticky actions + likes + composer */}
          <footer className="shrink-0 border-t border-border">
            <div className="flex items-center gap-1 px-3 pt-2.5">
              <IconBtn
                label={liked ? "Unlike" : "Like"}
                onClick={toggleLike}
                active={liked}
                activeClass="text-terracotta"
              >
                <Heart
                  className="size-[1.35rem]"
                  fill={liked ? "currentColor" : "none"}
                  aria-hidden
                />
              </IconBtn>
              <IconBtn
                label="Comment"
                onClick={() => composerRef.current?.focus()}
              >
                <MessageCircle className="size-[1.35rem]" aria-hidden />
              </IconBtn>
              <IconBtn label="Share" onClick={share}>
                <Share2 className="size-[1.35rem]" aria-hidden />
              </IconBtn>
              <div className="ml-auto">
                <IconBtn
                  label={saved ? "Unsave" : "Save"}
                  onClick={toggleSave}
                  active={saved}
                >
                  <Bookmark
                    className="size-[1.35rem]"
                    fill={saved ? "currentColor" : "none"}
                    aria-hidden
                  />
                </IconBtn>
              </div>
            </div>

            <div className="px-4 pb-2 pt-1">
              <p className="text-[14px] font-semibold text-foreground">
                {likes > 0 ? `${formatCount(likes)} likes` : "Be the first to like"}
              </p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-foreground-muted">
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
                  <span className="normal-case tracking-normal">
                    {" "}
                    · {formatCount(commentCount)} comments
                  </span>
                ) : null}
              </p>
            </div>

            <form
              onSubmit={submitComment}
              className="flex items-center gap-2 border-t border-border px-4 py-2.5"
            >
              <Avatar
                name={viewer.name}
                src={viewer.avatar}
                size="sm"
                className="size-7 text-[9px]"
              />
              <input
                ref={composerRef}
                name="body"
                required
                placeholder="Add a comment…"
                disabled={pending}
                className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[14px] text-foreground outline-none placeholder:text-foreground-muted disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={pending}
                className="shrink-0 text-[14px] font-semibold text-brand transition hover:text-brand-strong disabled:opacity-40"
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
        "grid size-10 place-items-center rounded-full text-foreground transition hover:text-foreground-muted",
        active && activeClass,
      )}
    >
      {children}
    </button>
  );
}
