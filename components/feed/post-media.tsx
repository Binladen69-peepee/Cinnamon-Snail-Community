import Link from "next/link";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type MediaItem = {
  id: string;
  url: string;
  alt: string | null;
  kind?: string;
  width?: number | null;
  height?: number | null;
};

/** Tallest a single image may be, as width/height. Anything taller is cropped. */
const MIN_RATIO = 0.8;
const MAX_RATIO = 2.2;

/**
 * Post media.
 *
 * The ratio comes from the stored width and height, so space is reserved before
 * the file arrives and the feed never jumps while images load.
 *
 * In compact density the media collapses to a right-hand thumbnail. That is
 * Reddit's compact view, and it roughly doubles how many posts fit on a screen.
 */
export function PostMedia({
  items,
  postId,
  compact = false,
}: {
  items: MediaItem[];
  postId: string;
  compact?: boolean;
}) {
  if (items.length === 0) return null;

  if (compact) {
    const first = items[0];
    return (
      <Link
        href={`/posts/${postId}`}
        aria-label={first.alt || "View post media"}
        className="relative block size-[72px] shrink-0 overflow-hidden rounded-ctl border border-border bg-mint no-underline"
      >
        <Frame item={first} fill />
        {items.length > 1 ? (
          <span className="absolute bottom-0 right-0 bg-[rgba(9,20,16,0.7)] px-1 text-[10px] font-bold text-white">
            {items.length}
          </span>
        ) : null}
      </Link>
    );
  }

  const single = items.length === 1;
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;

  if (single && items[0].kind === "video") {
    return (
      <div
        className="mt-2 overflow-hidden rounded-ctl border border-border bg-black"
        style={{ aspectRatio: String(ratioOf(items[0])) }}
      >
        { }
        <video
          src={items[0].url}
          controls
          playsInline
          preload="metadata"
          className="size-full object-contain"
        />
      </div>
    );
  }

  return (
    <Link
      href={`/posts/${postId}`}
      aria-label={
        single ? items[0].alt || "View post image" : `View all ${items.length} images`
      }
      className="group/media mt-2 block overflow-hidden rounded-ctl border border-border bg-mint/40 no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
                  className="pointer-events-none absolute inset-0 grid place-items-center bg-[rgba(9,20,16,0.3)]"
                  aria-hidden
                >
                  <span className="grid size-9 place-items-center rounded-full bg-white/90 text-forest">
                    <Play className="size-4 translate-x-px" />
                  </span>
                </span>
              ) : null}
              {extra > 0 && index === shown.length - 1 ? (
                <span className="absolute inset-0 grid place-items-center bg-[rgba(9,20,16,0.55)] text-xl font-bold text-white">
                  +{extra}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Link>
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
    // Member uploads and the media library are arbitrary hosts, not optimizer
    // inputs.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.url}
      alt={item.alt ?? ""}
      width={item.width ?? undefined}
      height={item.height ?? undefined}
      loading={eager ? undefined : "lazy"}
      decoding="async"
      className={cn(
        "size-full object-cover transition-transform duration-500 group-hover/media:scale-[1.02]",
        fill && "absolute inset-0",
      )}
    />
  );
}
