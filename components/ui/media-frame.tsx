import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one place a photograph gets its frame and its motion.
 *
 * Every content image on the site goes through here so the treatment is
 * identical everywhere: a cropped frame, a slow scale on hover, and a gentle
 * fade-and-settle the first time it scrolls into view. Sections that want a
 * different radius or aspect pass one in; none of them re-implement the motion.
 *
 * This is deliberately NOT a client component. The hover is pure CSS, and the
 * reveal is driven by one shared observer mounted once in the root layout
 * (`MediaRevealRuntime`), which finds frames by their `data-media-reveal`
 * attribute. So a server component can render a photo without dragging a
 * client boundary — and a hundred photos still cost exactly one observer.
 *
 * `<img>` rather than next/image throughout: these are arbitrary media-library
 * hosts (Adam's WordPress, Supabase, Kit's CDN), not optimizer inputs.
 */
export function MediaFrame({
  src,
  alt,
  aspect = "aspect-[4/3]",
  rounded = "rounded-[1.25rem]",
  className,
  imgClassName,
  objectPosition,
  hover = true,
  reveal = true,
  loading = "lazy",
  fetchPriority,
  sizes,
  children,
}: {
  src: string;
  /** Empty string is correct for purely decorative photography. */
  alt: string;
  aspect?: string;
  rounded?: string;
  /** Classes for the frame. */
  className?: string;
  /** Classes for the image itself. */
  imgClassName?: string;
  /** e.g. "50% 22%" to choose the crop on a tall source. */
  objectPosition?: string;
  hover?: boolean;
  reveal?: boolean;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  sizes?: string;
  /** Overlays that sit inside the crop — play buttons, numbers, captions. */
  children?: ReactNode;
}) {
  return (
    <div
      className={cn("vu-media", aspect, rounded, className)}
      {...(reveal ? { "data-media-reveal": "" } : {})}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        sizes={sizes}
        style={objectPosition ? { objectPosition } : undefined}
        className={cn("vu-media-img", hover && "vu-media-zoom", imgClassName)}
      />
      {children}
    </div>
  );
}
