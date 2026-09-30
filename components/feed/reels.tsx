"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  Clapperboard,
  Heart,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import { reactAction, saveAction } from "@/app/(member)/community-actions";
import { runAction } from "@/components/feed/run-action";
import { PostFollowButton } from "@/components/feed/post-follow-button";
import { Avatar } from "@/components/ui/avatar";
import { DEFAULT_REACTION } from "@/lib/community/reactions";
import { formatCount } from "@/lib/community/format-count";
import { videoEmbedSrc, videoPosterUrl } from "@/lib/community/media";
import { youTubeId } from "@/lib/marketing/teasers";
import {
  reviveFeedCard,
  type FeedCardPost,
  type RevivedFeedCard,
} from "@/lib/community/feed-card";
import { cn } from "@/lib/utils";

/**
 * Reels: the feed's videos, one per screen, playing as you scroll.
 *
 * The shape is Instagram's, because that is the shape people already know how
 * to use: a vertical column that snaps one video at a time, the video filling
 * the frame, actions stacked down the right edge, the author and caption over
 * the bottom left. Only posts carrying a video are here — the server filters
 * them (`kind=video`), so a still image never appears as a blank reel.
 *
 * Playback is driven by visibility, not by a play button. Each reel watches
 * itself with an IntersectionObserver; when most of it is on screen it plays,
 * when it leaves it pauses. Everything starts muted, which is the only way a
 * browser will autoplay at all, and one tap on the speaker turns sound on for
 * every reel from then on — the way a person expects, rather than per video.
 *
 * Two kinds of source. An uploaded file is a real `<video>` we control fully.
 * A YouTube or Vimeo link becomes an iframe, mounted only while that reel is
 * the active one — mounting every embed in the column would load a third-party
 * player, and its cookies, for each reel whether or not it was ever seen. The
 * embed autoplays muted; sound on those is the player's own control, since an
 * iframe cannot be unmuted from outside without its vendor API.
 */

const LIKE = DEFAULT_REACTION;

export function Reels({
  initialPosts,
  initialCursor,
  sort,
  viewer,
}: {
  initialPosts: FeedCardPost[];
  initialCursor: string | null;
  sort: string;
  viewer: { name: string; avatar: string | null; handle: string };
}) {
  const [posts, setPosts] = useState<RevivedFeedCard[]>(() =>
    initialPosts.map(reviveFeedCard).filter(hasVideo),
  );
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(posts[0]?.id ?? null);
  const [muted, setMuted] = useState(true);
  const seen = useRef(new Set(initialPosts.map((post) => post.id)));
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // One stable callback for every reel. Each reel's observer depends on it, so
  // a fresh function per render would tear down and rebuild every observer on
  // every state change. A reel that leaves the screen gives the slot up, so
  // nothing plays while mostly out of view waiting for the next one to claim it.
  const onVisibility = useCallback((id: string, visible: boolean) => {
    setActiveId((current) => (visible ? id : current === id ? null : current));
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ sort, cursor, kind: "video" });
      const response = await fetch(`/api/community/feed?${params}`);
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as {
        posts: FeedCardPost[];
        nextCursor: string | null;
      };
      const fresh = data.posts.filter((post) => !seen.current.has(post.id));
      for (const post of fresh) seen.current.add(post.id);
      setPosts((current) => [...current, ...fresh.map(reviveFeedCard).filter(hasVideo)]);
      setCursor(data.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, sort]);

  // The sentinel sits inside the scrolling column, so the observer's root has
  // to be the column rather than the viewport.
  useEffect(() => {
    const node = sentinel.current;
    const root = scroller.current;
    if (!node || !root || !cursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // After a failure the button is the only way to retry. Without this
        // guard the re-created observer's first notification refetched at
        // once, and a dead endpoint got hammered without pause.
        if (failed) return;
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: "200% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, failed, loadMore]);

  if (posts.length === 0) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center px-6 py-16 text-center">
        <Clapperboard className="mx-auto size-7 text-brand" aria-hidden />
        <p className="mt-3 text-[16px] font-bold text-foreground">No reels yet</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-foreground-muted">
          Reels are the videos people post. When someone shares one, it plays here.
        </p>
        <Link
          href="/compose?type=VIDEO"
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-fill px-4 text-[13.5px] font-bold text-brand-fill-foreground no-underline transition hover:bg-brand-fill-hover"
        >
          Post a video
        </Link>
      </div>
    );
  }

  return (
    // Fills whatever height the page gives it; the page owns the viewport
    // arithmetic, so this cannot disagree with the toggle above it.
    <div className="relative mx-auto h-full w-full md:max-w-110 md:pb-3">
      <div
        ref={scroller}
        className={cn(
          "vu-reels relative h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-black",
          "md:rounded-card md:border md:border-border",
        )}
      >
        {posts.map((post) => (
          <Reel
            key={post.id}
            post={post}
            viewer={viewer}
            active={activeId === post.id}
            muted={muted}
            onVisibility={onVisibility}
          />
        ))}

        <div ref={sentinel} aria-hidden className="h-px" />

        {cursor ? (
          <div
            className="flex h-24 snap-start items-center justify-center text-[13px] text-white/80"
            aria-live="polite"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading more reels
              </span>
            ) : failed ? (
              <button
                type="button"
                onClick={() => void loadMore()}
                className="rounded-full border border-white/40 px-4 py-1.5 font-semibold text-white"
              >
                That did not load — try again
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void loadMore()}
                className="rounded-full border border-white/40 px-4 py-1.5 font-semibold text-white"
              >
                Load more
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Outside the scroller, so it stays put while the reels move under it.
          Inside, it scrolled away with the first reel. */}
      <button
        type="button"
        onClick={() => setMuted((value) => !value)}
        aria-label={muted ? "Turn sound on" : "Turn sound off"}
        aria-pressed={!muted}
        className="absolute right-3 top-3 z-20 grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {muted ? (
          <VolumeX className="size-5" aria-hidden />
        ) : (
          <Volume2 className="size-5" aria-hidden />
        )}
      </button>
    </div>
  );
}

function hasVideo(post: RevivedFeedCard) {
  return post.attachments.some((file) => file.kind === "video");
}

/* -------------------------------------------------------------------------- */

function Reel({
  post,
  viewer,
  active,
  muted,
  onVisibility,
}: {
  post: RevivedFeedCard;
  viewer: { name: string; avatar: string | null; handle: string };
  active: boolean;
  muted: boolean;
  onVisibility: (id: string, visible: boolean) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const clip = post.attachments.find((file) => file.kind === "video")!;
  const embed = videoEmbedSrc(clip.url);
  const poster = videoPosterUrl(clip.url, clip.thumbnailUrl);
  const name = post.author.profile?.displayName ?? post.author.handle;
  const isOwn = viewer.handle === post.author.handle;
  const caption = (post.title || post.plainText || "").trim();

  // Active while most of it is on screen; gives the slot up as soon as it is
  // not. Leaving also clears a manual pause, so the reel autoplays again when
  // scrolled back to — reset here, on the visibility event, rather than by
  // syncing state to `active` in an effect.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible = entry.isIntersecting && entry.intersectionRatio >= 0.6;
          onVisibility(post.id, visible);
          if (!visible) setPaused(false);
        }
      },
      { threshold: [0.6] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisibility, post.id]);

  // Play when active, pause when not. A reel you scrolled past should not keep
  // playing underneath the one you are watching.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (active && !paused) {
      void element.play().catch((error: unknown) => {
        // A flick to the next reel pauses this one while its play() is still
        // pending, which rejects with AbortError. That is not a refusal and
        // must not leave the reel marked paused, or it will not autoplay when
        // scrolled back to. A real refusal (data saver, an unmuted attempt)
        // keeps the poster and play glyph, and a tap starts it.
        if ((error as { name?: string } | null)?.name === "AbortError") return;
        setPaused(true);
      });
    } else {
      element.pause();
    }
  }, [active, paused]);

  return (
    <article
      ref={frame}
      aria-label={caption || `Video by ${name}`}
      className="relative h-full w-full snap-start snap-always overflow-hidden bg-black"
    >
      {/* ---------------------------------------------------------- video */}
      {embed ? (
        active ? (
          <iframe
            src={autoplaySrc(embed, clip.url)}
            title={caption || "Video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 size-full"
          />
        ) : (
          <Poster src={poster} />
        )
      ) : (
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? "Play" : "Pause"}
          className="absolute inset-0 block size-full focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
        >
          <video
            ref={video}
            src={clip.url}
            poster={poster ?? undefined}
            muted={muted}
            loop
            playsInline
            preload={active ? "auto" : "metadata"}
            className="size-full object-cover"
          />
          {paused ? (
            <span
              className="pointer-events-none absolute inset-0 grid place-items-center"
              aria-hidden
            >
              <span className="grid size-16 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                <Play className="size-7 translate-x-0.5" />
              </span>
            </span>
          ) : null}
        </button>
      )}

      {/* Legibility scrim for the text over the bottom of the frame. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/75 via-black/30 to-transparent"
        aria-hidden
      />

      {/* -------------------------------------------------------- actions */}
      <ReelActions post={post} />

      {/* --------------------------------------------------------- author */}
      <div className="absolute bottom-0 left-0 right-16 z-10 px-4 pb-4 text-white">
        <div className="flex items-center gap-2.5">
          <Link href={`/members/${post.author.handle}`} className="shrink-0 no-underline">
            <Avatar
              name={name}
              src={post.author.profile?.avatarUrl}
              size="sm"
              className="size-9 ring-2 ring-white/90"
            />
          </Link>
          <Link
            href={`/members/${post.author.handle}`}
            className="truncate rounded-sm text-[14px] font-bold text-white no-underline drop-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {name}
          </Link>
          {!isOwn ? (
            <span className="reel-follow shrink-0">
              <PostFollowButton
                handle={post.author.handle}
                initialFollowing={Boolean(post.viewerFollowsAuthor)}
              />
            </span>
          ) : null}
        </div>

        {caption ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse caption" : "Expand caption"}
            className={cn(
              "mt-2 block w-full rounded-sm text-left text-[13.5px] leading-snug text-white drop-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              !expanded && "line-clamp-2",
            )}
          >
            {caption}
          </button>
        ) : null}

        <Link
          href={`/spaces/${post.space.slug}`}
          className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold text-white no-underline backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Clapperboard className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {post.space.name.startsWith("#") ? post.space.name : `# ${post.space.name}`}
          </span>
        </Link>
      </div>

      {!active && !paused && !embed ? (
        // The frame the reader is scrolling past: its video is paused, so it
        // says so rather than looking frozen.
        <span className="pointer-events-none absolute right-3 bottom-4 z-10 text-white/70" aria-hidden>
          <Pause className="size-4" />
        </span>
      ) : null}
    </article>
  );
}

function Poster({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className="absolute inset-0 size-full object-cover"
    />
  ) : (
    <span className="absolute inset-0 bg-black" aria-hidden />
  );
}

/**
 * The embed URL with autoplay-muted looping turned on, for YouTube and Vimeo
 * alike. YouTube only honours `loop=1` when the video is also named as a
 * one-item `playlist`; without that it plays once and stops.
 */
function autoplaySrc(embed: string, url: string) {
  const joiner = embed.includes("?") ? "&" : "?";
  if (embed.includes("player.vimeo.com")) {
    return `${embed}${joiner}autoplay=1&muted=1&loop=1`;
  }
  const id = youTubeId(url);
  const loop = id ? `&loop=1&playlist=${id}` : "";
  return `${embed}${joiner}autoplay=1&mute=1&playsinline=1${loop}`;
}

/* -------------------------------------------------------------------------- */

type ReelState = {
  myReaction: string | null;
  counts: Record<string, number>;
  saved: boolean;
};

/**
 * The column down the right edge: like, comment, send, save, more.
 *
 * Like is the feed's default reaction under a heart, so a reel liked here
 * shows as the same reaction on the post everywhere else — the two views are
 * one post, not two.
 */
function ReelActions({ post }: { post: RevivedFeedCard }) {
  const [, startTransition] = useTransition();
  const [state, setState] = useState<ReelState>({
    myReaction: post.myReaction ?? null,
    counts: post.reactionCounts ?? {},
    saved: post.myBookmark ?? false,
  });
  const [copied, setCopied] = useState(false);

  const total = useMemo(
    () => Object.values(state.counts).reduce((sum, n) => sum + n, 0),
    [state.counts],
  );
  const liked = state.myReaction !== null;

  function like() {
    const clearing = liked;
    const next = { ...state.counts };
    if (state.myReaction) {
      next[state.myReaction] = Math.max(0, (next[state.myReaction] ?? 1) - 1);
    }
    if (!clearing) next[LIKE] = (next[LIKE] ?? 0) + 1;
    const before = state;
    setState({ ...state, myReaction: clearing ? null : LIKE, counts: next });

    const data = new FormData();
    data.set("postId", post.id);
    data.set("emoji", LIKE);
    startTransition(async () => {
      const ok = await runAction(reactAction, data);
      if (!ok) setState(before);
    });
  }

  function save() {
    const before = state;
    setState({ ...state, saved: !state.saved });
    const data = new FormData();
    data.set("postId", post.id);
    startTransition(async () => {
      const ok = await runAction(saveAction, data);
      if (!ok) setState(before);
    });
  }

  async function share() {
    const url = new URL(`/posts/${post.id}`, window.location.origin).toString();
    if (navigator.share) {
      await navigator.share({ url, title: "Vegan University" }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be refused.
    }
  }

  // The theme's focus ring is ink-coloured — invisible on this black surface —
  // so every control here draws its own, in white.
  const button =
    "grid place-items-center gap-1 rounded-md text-white drop-shadow transition active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
  const count = "text-[12px] font-semibold tabular-nums";

  return (
    <div className="absolute bottom-5 right-2.5 z-10 flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={like}
        aria-pressed={liked}
        // The count is part of the name, or a screen reader hears "Like" and
        // never the number the sighted reader sees.
        aria-label={`${liked ? "Unlike" : "Like"}${total > 0 ? `, ${formatCount(total)}` : ""}`}
        className={button}
      >
        <Heart
          className={cn("size-7", liked && "text-danger")}
          fill={liked ? "currentColor" : "none"}
          aria-hidden
        />
        <span className={count}>{total > 0 ? formatCount(total) : "Like"}</span>
      </button>

      <Link
        href={`/posts/${post.id}`}
        aria-label={`Comments${post._count.comments > 0 ? `, ${formatCount(post._count.comments)}` : ""}`}
        className={cn(button, "no-underline")}
      >
        <MessageCircle className="size-7" aria-hidden />
        <span className={count}>
          {post._count.comments > 0 ? formatCount(post._count.comments) : "Comment"}
        </span>
      </Link>

      <button type="button" onClick={share} aria-label="Send" className={button}>
        <Send className="size-7" aria-hidden />
        <span className={count}>{copied ? "Copied" : "Send"}</span>
      </button>

      <button
        type="button"
        onClick={save}
        aria-pressed={state.saved}
        aria-label={state.saved ? "Remove from saved" : "Save"}
        className={button}
      >
        <Bookmark
          className="size-7"
          fill={state.saved ? "currentColor" : "none"}
          aria-hidden
        />
        <span className={count}>{state.saved ? "Saved" : "Save"}</span>
      </button>

      <Link
        href={`/posts/${post.id}`}
        aria-label="Open post"
        className={cn(button, "no-underline")}
      >
        {/* An arrow, not a "⋯": this opens the post, it does not open a menu.
            The post page carries the overflow (report, delete, pin). */}
        <ArrowUpRight className="size-7" aria-hidden />
      </Link>
    </div>
  );
}
