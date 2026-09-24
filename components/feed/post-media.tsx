"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { InlineVideo } from "@/components/feed/inline-video";
import { useIsMobile } from "@/components/hooks/use-media-query";
import { videoEmbedSrc, videoPosterUrl } from "@/lib/community/media";
import { cn } from "@/lib/utils";

export type MediaItem = {
  id: string;
  url: string;
  alt: string | null;
  kind?: string;
  width?: number | null;
  height?: number | null;
  thumbnailUrl?: string | null;
};

/** Tallest a single image may be, as width/height. Anything taller is cropped. */
const MIN_RATIO = 0.8;
const MAX_RATIO = 2.2;

/**
 * A post's media, in the feed.
 *
 * On a wide screen this is a grid of thumbnails that opens a lightbox, which
 * is the right shape when there is room beside the post for an overlay and a
 * pointer to close it with.
 *
 * On a phone it is not. A lightbox there covers the whole screen, hides the
 * post it belongs to and takes a second gesture to leave, so the media is
 * shown in place instead: one image is simply an image, several become a strip
 * you swipe, and a video plays where it sits. Nothing opens over anything.
 *
 * Video plays inline at every width. Opening a modal to press play was never
 * the shorter path to watching something.
 */
export function PostMedia({
  items,
  compact = false,
  onOpen,
  flush = false,
  href,
}: {
  items: MediaItem[];
  compact?: boolean;
  /** Opens the post lightbox at the given slide index. Wide screens only. */
  onOpen?: (index: number) => void;
  /** Edge-to-edge inside a post card (no top margin / outer radius). */
  flush?: boolean;
  /** Where the post lives, for the phone path that navigates instead. */
  href?: string;
}) {
  const isMobile = useIsMobile();
  if (items.length === 0) return null;

  const single = items.length === 1;

  /* ---------------------------------------------------------------- compact */
  // The round thumbnail beside a dense row. Too small to play anything in, so
  // on a phone it goes to the post rather than opening an overlay.
  if (compact) {
    const first = items[0]!;
    const inner = (
      <>
        <Frame item={first} fill />
        {first.kind === "video" ? (
          <span
            className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30"
            aria-hidden
          >
            <span className="grid size-8 place-items-center rounded-full bg-white/90 text-black">
              <Play className="size-3.5 translate-x-px" />
            </span>
          </span>
        ) : null}
        {items.length > 1 ? (
          <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 text-[10px] text-white">
            {items.length}
          </span>
        ) : null}
      </>
    );
    const shell =
      "relative block size-[5.75rem] shrink-0 overflow-hidden rounded-full border border-border bg-surface-muted ring-1 ring-border/40";

    if (isMobile && href) {
      return (
        <Link href={href} aria-label={first.alt || "Open post"} className={shell}>
          {inner}
        </Link>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onOpen?.(0)}
        aria-label={
          items.length > 1
            ? `View all ${items.length} images`
            : first.alt || "View post"
        }
        className={shell}
      >
        {inner}
      </button>
    );
  }

  /* ------------------------------------------------------------------ video */
  // One video, at any width: it plays where it is.
  if (single && items[0]!.kind === "video") {
    return (
      <div className={flush ? "" : "mt-2"}>
        <InlineVideo
          url={items[0]!.url}
          alt={items[0]!.alt}
          thumbnailUrl={items[0]!.thumbnailUrl}
          ratio={String(ratioOf(items[0]!))}
          rounded={!flush}
        />
      </div>
    );
  }

  /* ----------------------------------------------------------------- mobile */
  if (isMobile) {
    if (single) {
      const item = items[0]!;
      return (
        <div
          className={cn(
            "w-full overflow-hidden bg-surface-muted",
            flush ? "rounded-none" : "mt-2 rounded-ctl border border-border",
          )}
          style={{ aspectRatio: String(ratioOf(item)) }}
        >
          <Frame item={item} eager />
        </div>
      );
    }

    // Several: a strip you swipe, with every item reachable without leaving
    // the post. Scroll snapping makes it land on one image at a time.
    return (
      <div className={flush ? "" : "mt-2"}>
        <ul
          className={cn(
            "vu-scroll-x flex snap-x snap-mandatory gap-1.5 overflow-x-auto",
            flush ? "px-0" : "",
          )}
        >
          {items.map((item, index) => (
            <li
              key={item.id}
              className={cn(
                "relative w-full shrink-0 snap-center overflow-hidden bg-surface-muted",
                flush ? "rounded-none" : "rounded-ctl border border-border",
              )}
              style={{ aspectRatio: String(ratioOf(item)) }}
            >
              {item.kind === "video" ? (
                <InlineVideo
                  url={item.url}
                  alt={item.alt}
                  thumbnailUrl={item.thumbnailUrl}
                  ratio={String(ratioOf(item))}
                  rounded={false}
                />
              ) : (
                <Frame item={item} fill eager={index === 0} />
              )}
              <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                {index + 1}/{items.length}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /* ---------------------------------------------------------------- desktop */
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(0)}
      aria-label={
        single ? items[0]!.alt || "View post" : `View all ${items.length} images`
      }
      className={cn(
        "group/media block w-full overflow-hidden bg-surface-muted text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        flush ? "rounded-none border-0" : "mt-2 rounded-ctl border border-border",
      )}
      style={single ? { aspectRatio: String(ratioOf(items[0]!)) } : undefined}
    >
      {single ? (
        <Frame item={items[0]!} eager />
      ) : (
        <div className={cn("grid gap-0.5", gridFor(shown.length))}>
          {shown.map((item, index) => (
            <div
              key={item.id}
              className={cn(
                "relative overflow-hidden",
                shown.length === 3 && index === 0 && "row-span-2",
              )}
            >
              <Frame item={item} fill />
              {item.kind === "video" ? (
                <span
                  className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30"
                  aria-hidden
                >
                  <span className="grid size-9 place-items-center rounded-full bg-white/90 text-black">
                    <Play className="size-4 translate-x-px" />
                  </span>
                </span>
              ) : null}
              {extra > 0 && index === shown.length - 1 ? (
                <span className="absolute inset-0 grid place-items-center bg-black/60 text-xl font-bold text-white">
                  +{extra}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function gridFor(count: number) {
  if (count === 2) return "aspect-16/10 grid-cols-2";
  if (count === 3) return "aspect-16/11 grid-cols-2 grid-rows-2";
  return "aspect-square grid-cols-2 grid-rows-2";
}

function ratioOf(item: MediaItem) {
  if (!item.width || !item.height) return 1.25;
  const raw = item.width / item.height;
  return Math.min(Math.max(raw, MIN_RATIO), MAX_RATIO).toFixed(4);
}

function Frame({
  item,
  fill,
  eager,
}: {
  item: MediaItem;
  fill?: boolean;
  eager?: boolean;
}) {
  if (item.kind === "video") {
    const poster = videoPosterUrl(item.url, item.thumbnailUrl);
    if (poster) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt={item.alt ?? ""}
          loading={eager ? undefined : "lazy"}
          decoding="async"
          className={cn(
            "size-full bg-black object-cover",
            fill && "absolute inset-0",
          )}
        />
      );
    }
    // YouTube and friends cannot be painted by <video>; keep a dark plate with
    // the play overlay from the parent rather than a broken media element.
    if (videoEmbedSrc(item.url)) {
      return (
        <span
          className={cn("block size-full bg-black", fill && "absolute inset-0")}
          aria-hidden
        />
      );
    }
    return (
      <video
        src={item.url}
        muted
        playsInline
        preload="metadata"
        className={cn("size-full bg-black object-cover", fill && "absolute inset-0")}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.url}
      alt={item.alt ?? ""}
      width={item.width ?? undefined}
      height={item.height ?? undefined}
      loading={eager ? undefined : "lazy"}
      decoding="async"
      className={cn(
        "vu-media-zoom size-full object-cover",
        fill && "absolute inset-0",
      )}
    />
  );
}
