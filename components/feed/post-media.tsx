"use client";

import { Play } from "lucide-react";
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
 * Feed media thumbnail / grid. Opens the Instagram lightbox via onOpen when
 * the post has gallery context; otherwise links through onOpen still fire for
 * parents that own the modal.
 *
 * Video tiles prefer an explicit thumbnail (or a YouTube still) so the feed
 * never shows a blank first frame while metadata loads.
 */
export function PostMedia({
  items,
  compact = false,
  onOpen,
  flush = false,
}: {
  items: MediaItem[];
  compact?: boolean;
  /** Opens the post lightbox at the given slide index. */
  onOpen?: (index: number) => void;
  /** Edge-to-edge inside a post card (no top margin / outer radius). */
  flush?: boolean;
}) {
  if (items.length === 0) return null;

  function openAt(index: number) {
    onOpen?.(index);
  }

  if (compact) {
    const first = items[0];
    return (
      <button
        type="button"
        onClick={() => openAt(0)}
        aria-label={
          items.length > 1
            ? `View all ${items.length} images`
            : first.alt || "View post"
        }
        className="relative block size-[5.75rem] shrink-0 overflow-hidden rounded-full border border-border bg-mint ring-1 ring-border/40"
      >
        <Frame item={first} fill />
        {first.kind === "video" ? (
          <span
            className="pointer-events-none absolute inset-0 grid place-items-center bg-[rgba(0,0,0,0.28)]"
            aria-hidden
          >
            <span className="grid size-8 place-items-center rounded-full bg-white/90 text-forest">
              <Play className="size-3.5 translate-x-px" />
            </span>
          </span>
        ) : null}
        {items.length > 1 ? (
          <span className="absolute bottom-1 right-1 rounded-full bg-[rgba(0,0,0,0.72)] px-1.5 text-[10px] text-white">
            {items.length}
          </span>
        ) : null}
      </button>
    );
  }

  const single = items.length === 1;
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;

  if (single && items[0].kind === "video") {
    return (
      <button
        type="button"
        onClick={() => openAt(0)}
        aria-label="View video"
        className={cn(
          "relative block w-full overflow-hidden bg-black text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          flush ? "rounded-none border-0" : "mt-2 rounded-ctl border border-border",
        )}
        style={{ aspectRatio: String(ratioOf(items[0])) }}
      >
        <Frame item={items[0]} fill />
        <span
          className="pointer-events-none absolute inset-0 grid place-items-center bg-[rgba(0,0,0,0.22)]"
          aria-hidden
        >
          <span className="grid size-12 place-items-center rounded-full bg-white/90 text-forest">
            <Play className="size-5 translate-x-px" />
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openAt(0)}
      aria-label={
        single ? items[0].alt || "View post" : `View all ${items.length} images`
      }
      className={cn(
        "group/media block w-full overflow-hidden bg-mint/40 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        flush ? "rounded-none border-0" : "mt-2 rounded-ctl border border-border",
      )}
      style={single ? { aspectRatio: String(ratioOf(items[0])) } : undefined}
    >
      {single ? (
        <Frame item={items[0]} eager />
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
                  className="pointer-events-none absolute inset-0 grid place-items-center bg-[rgba(0,0,0,0.3)]"
                  aria-hidden
                >
                  <span className="grid size-9 place-items-center rounded-full bg-white/90 text-forest">
                    <Play className="size-4 translate-x-px" />
                  </span>
                </span>
              ) : null}
              {extra > 0 && index === shown.length - 1 ? (
                <span className="absolute inset-0 grid place-items-center bg-[rgba(0,0,0,0.55)] text-xl font-bold text-white">
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
    // YouTube (and similar) cannot be painted by <video>; keep a dark plate
    // with the play overlay from the parent rather than a broken media element.
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
