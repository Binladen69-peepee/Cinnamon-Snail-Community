"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { videoEmbedSrc, videoPosterUrl } from "@/lib/community/media";
import { cn } from "@/lib/utils";

/**
 * A video that plays where it sits.
 *
 * Tapping a video used to open a lightbox over the whole screen, which on a
 * phone means the post disappears, the page behind locks, and getting back is
 * a second gesture. A video in a feed should behave like a video in a feed:
 * press play, it plays, you keep scrolling.
 *
 * Two kinds of source, one behaviour. An uploaded file becomes a real `<video>`
 * with the browser's own controls, which is what gives a phone its fullscreen
 * button, its scrubber and its picture-in-picture for free. A YouTube or Vimeo
 * link becomes an iframe, and only after the poster is pressed — embedding one
 * on sight would load a third-party player, and its cookies, into every card
 * in the feed.
 */
export function InlineVideo({
  url,
  alt,
  thumbnailUrl,
  ratio,
  rounded = true,
}: {
  url: string;
  alt: string | null;
  thumbnailUrl?: string | null;
  /** width/height, so the space is reserved before anything loads. */
  ratio: string;
  rounded?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const embed = videoEmbedSrc(url);
  const poster = videoPosterUrl(url, thumbnailUrl);

  const frame = cn(
    "relative block w-full overflow-hidden bg-black",
    rounded ? "rounded-ctl border border-border" : "rounded-none border-0",
  );

  if (playing) {
    return (
      <div className={frame} style={{ aspectRatio: ratio }}>
        {embed ? (
          <iframe
            src={`${embed}${embed.includes("?") ? "&" : "?"}autoplay=1`}
            title={alt || "Video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 size-full"
          />
        ) : (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full bg-black object-contain"
          />
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={alt ? `Play ${alt}` : "Play video"}
      className={cn(
        frame,
        "text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
      )}
      style={{ aspectRatio: ratio }}
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt={alt ?? ""}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full bg-black object-cover"
        />
      ) : embed ? (
        <span className="absolute inset-0 bg-black" aria-hidden />
      ) : (
        <video
          src={url}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full bg-black object-cover"
        />
      )}
      <span
        className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25"
        aria-hidden
      >
        <span className="grid size-14 place-items-center rounded-full bg-white/90 text-black">
          <Play className="size-6 translate-x-px" />
        </span>
      </span>
    </button>
  );
}
