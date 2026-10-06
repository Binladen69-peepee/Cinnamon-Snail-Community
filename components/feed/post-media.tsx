"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { InlineVideo } from "@/components/feed/inline-video";
import { useIsMobile, useMediaQuery } from "@/components/hooks/use-media-query";
import { videoEmbedSrc, videoPosterUrl } from "@/lib/community/media";
import { isAnimatedMedia } from "@/lib/uploads/policy";
import { cn } from "@/lib/utils";

export type MediaItem = {
  id: string;
  url: string;
  alt: string | null;
  kind?: string;
  width?: number | null;
  height?: number | null;
  thumbnailUrl?: string | null;
  /** When the caller has it. GIFs are recognised by kind or file name without it. */
  mimeType?: string | null;
};

/** Tallest a single image may be, as width/height. Anything taller is cropped. */
const MIN_RATIO = 0.8;
const MAX_RATIO = 2.2;

/**
 * A video to play, as opposed to an image. A GIF is an image even when a row
 * calls it a video: `<video>` cannot play a GIF, and showing it as an image is
 * what makes it move.
 */
function isVideo(item: MediaItem): boolean {
  return item.kind === "video" && !isAnimatedMedia(item);
}

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
 *
 * GIFs play where they sit too, as plain `<img>` (an image optimizer keeps
 * only the first frame). Anything that moves on its own needs a way to stop
 * it, so a post with GIFs carries one "GIF" control that pauses and plays
 * them; it sits beside the media rather than inside the lightbox button,
 * because a button cannot hold a button. Someone who has asked their device
 * for reduced motion gets them paused on a still frame until they press play.
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
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  // The member's own choice wins over the device setting once they make one.
  const [gifChoice, setGifChoice] = useState<boolean | null>(null);
  if (items.length === 0) return null;

  const single = items.length === 1;
  const gifCount = items.filter((item) => isAnimatedMedia(item)).length;
  const gifsPlaying = gifChoice ?? !reduceMotion;
  const gifToggle =
    gifCount > 0 ? (
      <GifToggle
        playing={gifsPlaying}
        count={gifCount}
        onToggle={() => setGifChoice(!gifsPlaying)}
      />
    ) : null;

  /* ---------------------------------------------------------------- compact */
  // The thumbnail beside a compact row. Too small to play anything in, so on
  // a phone it goes to the post rather than opening an overlay.
  if (compact) {
    const first = items[0]!;
    const inner = (
      <>
        <Frame item={first} fill playing={gifsPlaying} />
        {isVideo(first) ? (
          <span
            className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30"
            aria-hidden
          >
            <span className="grid size-7 place-items-center rounded-full bg-white/90 text-black">
              <Play className="size-3 translate-x-px" />
            </span>
          </span>
        ) : null}
        {isAnimatedMedia(first) ? (
          <span
            className="pointer-events-none absolute bottom-1 left-1 rounded-chip bg-black/70 px-1 text-micro font-semibold text-white"
            aria-hidden
          >
            GIF
          </span>
        ) : null}
        {items.length > 1 ? (
          <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 text-micro font-semibold text-white">
            {items.length}
          </span>
        ) : null}
      </>
    );
    const shell =
      "relative block size-14 shrink-0 overflow-hidden rounded-ctl border border-border bg-surface-muted";

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
  if (single && isVideo(items[0]!)) {
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
            "relative w-full overflow-hidden bg-surface-muted",
            flush ? "rounded-none" : "mt-2 rounded-ctl border border-border",
          )}
          style={{ aspectRatio: String(ratioOf(item)) }}
        >
          <Frame item={item} eager playing={gifsPlaying} />
          {gifToggle}
        </div>
      );
    }

    // Several: a strip you swipe, with every item reachable without leaving
    // the post. Scroll snapping makes it land on one image at a time.
    return (
      <div className={cn("relative", flush ? "" : "mt-2")}>
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
              {isVideo(item) ? (
                <InlineVideo
                  url={item.url}
                  alt={item.alt}
                  thumbnailUrl={item.thumbnailUrl}
                  ratio={String(ratioOf(item))}
                  rounded={false}
                />
              ) : (
                <Frame item={item} fill eager={index === 0} playing={gifsPlaying} />
              )}
              <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-micro font-semibold tabular-nums text-white">
                {index + 1}/{items.length}
              </span>
            </li>
          ))}
        </ul>
        {gifToggle}
      </div>
    );
  }

  /* ---------------------------------------------------------------- desktop */
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;

  const grid = (
    <button
      type="button"
      onClick={() => onOpen?.(0)}
      aria-label={
        single ? items[0]!.alt || "View post" : `View all ${items.length} images`
      }
      className={cn(
        "group/media block w-full overflow-hidden bg-surface-muted text-left",
        flush ? "rounded-none border-0" : "rounded-ctl border border-border",
        !flush && !gifToggle && "mt-2",
      )}
      style={single ? { aspectRatio: String(ratioOf(items[0]!)) } : undefined}
    >
      {single ? (
        <Frame item={items[0]!} eager playing={gifsPlaying} />
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
              <Frame item={item} fill playing={gifsPlaying} />
              {isVideo(item) ? (
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
                <span className="absolute inset-0 grid place-items-center bg-black/60 text-heading font-semibold text-white">
                  +{extra}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </button>
  );

  if (!gifToggle) return grid;
  // The pause control is the lightbox button's sibling, laid over its corner.
  return (
    <div className={cn("relative", flush ? "" : "mt-2")}>
      {grid}
      {gifToggle}
    </div>
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

/** The one control that pauses and plays a post's GIFs. */
function GifToggle({
  playing,
  count,
  onToggle,
}: {
  playing: boolean;
  count: number;
  onToggle: () => void;
}) {
  const noun = count > 1 ? "GIFs" : "GIF";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={playing ? `Pause ${noun}` : `Play ${noun}`}
      title={playing ? `Pause ${noun}` : `Play ${noun}`}
      className="absolute bottom-2 left-2 z-10 inline-flex h-7 items-center gap-1 rounded-full bg-black/70 px-2.5 text-micro font-semibold uppercase tracking-[0.06em] text-white transition hover:bg-black/85"
    >
      {playing ? (
        <Pause className="size-3" aria-hidden />
      ) : (
        <Play className="size-3" aria-hidden />
      )}
      GIF
    </button>
  );
}

function Frame({
  item,
  fill,
  eager,
  playing = true,
}: {
  item: MediaItem;
  fill?: boolean;
  eager?: boolean;
  /** For a GIF: whether it moves. Ignored for anything else. */
  playing?: boolean;
}) {
  if (isVideo(item)) {
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
  if (isAnimatedMedia(item)) {
    return <AnimatedFrame item={item} fill={fill} eager={eager} playing={playing} />;
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

/**
 * A GIF that can be held still.
 *
 * An `<img>` cannot pause a GIF, so a paused one is a canvas holding the frame
 * that was showing, drawn the way `object-cover` would crop it. Drawing a
 * cross-origin image only marks the canvas unreadable; it still shows, which
 * is all this needs. If drawing fails the canvas stays blank over the muted
 * plate, which is still not moving.
 */
function AnimatedFrame({
  item,
  fill,
  eager,
  playing,
}: {
  item: MediaItem;
  fill?: boolean;
  eager?: boolean;
  playing: boolean;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (playing) return;
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    const paint = () => paintStill(canvas, image);
    if (image.complete) paint();
    image.addEventListener("load", paint);
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(paint) : null;
    observer?.observe(canvas);
    return () => {
      image.removeEventListener("load", paint);
      observer?.disconnect();
    };
  }, [playing]);

  const description = item.alt || "GIF";
  return (
    <span
      className={cn(
        "block overflow-hidden bg-surface-muted",
        fill ? "absolute inset-0" : "relative size-full",
      )}
    >
      {/* A plain <img>: next/image would keep only the first frame. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        src={item.url}
        alt={item.alt ?? ""}
        width={item.width ?? undefined}
        height={item.height ?? undefined}
        loading={eager ? undefined : "lazy"}
        decoding="async"
        className={cn("size-full object-cover", !playing && "invisible")}
      />
      {!playing ? (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${description} (paused)`}
          className="absolute inset-0 size-full"
        />
      ) : null}
    </span>
  );
}

function paintStill(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  if (!width || !height || !naturalWidth || !naturalHeight) return;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return;
  // object-fit: cover — fill the box, crop the overflow evenly.
  const fit = Math.max(canvas.width / naturalWidth, canvas.height / naturalHeight);
  const sourceWidth = canvas.width / fit;
  const sourceHeight = canvas.height / fit;
  try {
    context.drawImage(
      image,
      (naturalWidth - sourceWidth) / 2,
      (naturalHeight - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  } catch {
    // A broken image cannot be drawn; the plate behind stays.
  }
}
