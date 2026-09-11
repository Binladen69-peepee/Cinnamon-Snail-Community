"use client";

import { useEffect, useRef, useState } from "react";
import { Play, VideoOff } from "lucide-react";
import { revealAndPlay } from "@/lib/marketing/video-reveal";
import { cn } from "@/lib/utils";

/**
 * The sales video player: Adam talking straight to camera.
 *
 * Tap-to-play with native controls rather than autoplay — this one has a voice
 * track, and it is the point of the section rather than background texture. The
 * frame opens from a dot at the centre out to full size before playback starts,
 * matching the hero and the reel.
 */
export function SalesVideo({
  src,
  portrait,
  label,
}: {
  src: string;
  portrait: boolean;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const opened = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => {
      setPlaying(true);
      setOpening(false);
    };
    const onPause = () => setPlaying(false);
    const onError = () => {
      setOpening(false);
      setFailed(true);
      console.error(`[sales-video] could not load ${src}.`);
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onPause);
    video.addEventListener("error", onError);

    // Server-rendered, so a failure can beat hydration. See reel.tsx.
    if (video.error) onError();

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onPause);
      video.removeEventListener("error", onError);
    };
  }, [src]);

  function start() {
    const video = videoRef.current;
    if (!video || failed) return;
    if (opened.current) {
      void video.play().catch(() => {});
      return;
    }
    opened.current = true;
    setOpening(true);
    revealAndPlay(video);
  }

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={src}
        controls={playing}
        playsInline
        preload="metadata"
        className={cn("w-full bg-black", portrait ? "aspect-[9/16]" : "aspect-video")}
      />

      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-[#0b2a22] px-6 text-center">
          <div>
            <VideoOff className="mx-auto size-7 text-white/50" aria-hidden />
            <p className="mt-3 text-[13px] font-semibold leading-snug text-white/85">
              This video is temporarily unavailable.
            </p>
          </div>
        </div>
      ) : !playing && !opening ? (
        <button
          type="button"
          onClick={start}
          aria-label={`Play: ${label}`}
          className="group absolute inset-0 grid place-items-center bg-[linear-gradient(180deg,rgba(6,26,21,0.12)_0%,rgba(6,26,21,0.5)_100%)]"
        >
          <span className="grid size-[4.5rem] place-items-center rounded-full bg-white/95 text-forest shadow-[0_12px_34px_rgba(0,0,0,0.35)] transition group-hover:scale-105">
            <Play className="size-7 translate-x-0.5" aria-hidden />
          </span>
        </button>
      ) : null}
    </div>
  );
}
