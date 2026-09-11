import Link from "next/link";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type MediaItem = {
  id: string;
  url: string;
  alt: string | null;
  /** "image", "gif" or "video". */
  kind?: string;
  /** Optional because older attachment rows were written without dimensions. */
  width?: number | null;
  height?: number | null;
};

/**
 * Tallest a single image is allowed to be, as a width/height ratio. Adam's
 * library is mostly 2:3 portrait, which at full feed width would push the
 * action bar off the screen on a phone, so anything taller than 4:5 is
 * centre-cropped — the same clamp Twitter and Instagram apply.
 */
const MIN_RATIO = 0.8;
/** And nothing wider than a cinema frame, so panoramas keep some height. */
const MAX_RATIO = 2.2;

/**
 * Post media, sized large.
 *
 * The ratio comes from the stored `width`/`height` on the attachment, so the
 * space is reserved before the file arrives and the feed never jumps while
 * images load. Those columns existed on `PostAttachment` from the start and
 * were never populated; the seed and the upload path both fill them now.
 */
export function PostMedia({
  items,
  postId,
  className,
}: {
  items: MediaItem[];
  postId: string;
  className?: string;
}) {
  if (items.length === 0) return null;

  const single = items.length === 1;
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;

  // A lone video is a player, not a thumbnail that navigates. Controls only,
  // no autoplay: sound that starts by itself in a feed is hostile.
  if (single && items[0].kind === "video") {
    return (
      <div
        className={cn(
          "mt-3 overflow-hidden rounded-ctl border border-border/70 bg-black",
          className,
        )}
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
        single ? (items[0].alt || "View post image") : `View all ${items.length} images`
      }
      className={cn(
        "group/media mt-3 block overflow-hidden rounded-ctl border border-border/70 bg-mint/40 no-underline",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className,
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
                // Three images read best as one tall plate beside two halves.
                shown.length === 3 && index === 0 && "row-span-2",
              )}
            >
              <Frame item={item} fill />
              {item.kind === "video" ? (
                <span
                  className="pointer-events-none absolute inset-0 grid place-items-center bg-[rgba(9,20,16,0.3)]"
                  aria-hidden
                >
                  <span className="grid size-10 place-items-center rounded-full bg-white/90 text-forest">
                    <Play className="size-4 translate-x-px" />
                  </span>
                </span>
              ) : null}
              {extra > 0 && index === shown.length - 1 ? (
                <span className="absolute inset-0 grid place-items-center bg-[rgba(9,20,16,0.55)] text-2xl font-bold text-white">
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
  if (count === 2) return "aspect-[16/10] grid-cols-2";
  if (count === 3) return "aspect-[16/11] grid-cols-2 grid-rows-2";
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
      // Metadata only: this is a still standing in for the video in a grid.
       
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
    // Member uploads and Adam's media library are arbitrary hosts, not
    // optimizer inputs.
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
