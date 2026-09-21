"use client";

import { useState } from "react";
import { ChefHat, Play } from "lucide-react";
import { playingEmbedSrc } from "@/lib/marketing/class-library";

/**
 * The still, and the teaser behind it.
 *
 * The iframe is not mounted until it is asked for. Embedding it on load would
 * hand a third party a request — and a frame's worth of network — on every
 * class page open, whether or not anybody watched. Pressing play is also the
 * moment autoplay is legitimate, which is why the src only gains it then.
 */
export function ClassPlayer({
  photo,
  teaserEmbed,
  title,
}: {
  photo: string | null;
  teaserEmbed: string | null;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing && teaserEmbed) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-card bg-black">
        <iframe
          src={playingEmbedSrc(teaserEmbed)}
          title={`${title} teaser`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="size-full"
        />
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-card bg-black">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center bg-brand-wash text-brand-strong/40">
          <ChefHat className="size-12" aria-hidden />
        </span>
      )}

      {teaserEmbed ? (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="absolute inset-0 grid place-items-center bg-black/25 transition hover:bg-black/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
        >
          <span className="grid size-16 place-items-center rounded-full bg-white/95 text-on-brand shadow-e2">
            <Play className="size-7 translate-x-0.5 fill-current" aria-hidden />
          </span>
          <span className="sr-only">Play the {title} teaser</span>
        </button>
      ) : null}
    </div>
  );
}
