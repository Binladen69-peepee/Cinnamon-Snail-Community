"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, VideoOff } from "lucide-react";
import { revealAndPlay } from "@/lib/marketing/video-reveal";

/**
 * Vertical "reel" card for portrait footage.
 *
 * Shaped 9:16 with rounded corners and native controls, so a phone-shot clip is
 * presented the way it was filmed instead of being cropped into a wide frame or
 * letterboxed with black bars.
 *
 * It does not autoplay: this clip is Adam talking, and sound that starts by
 * itself is hostile. A single tap opens the frame from a dot at the centre out
 * to full size, then starts it with audio. It also does not loop — looping a
 * monologue is worse than stopping at the end.
 */
export function Reel({
  src,
  label,
}: {
  src: string;
  label: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const opened = useRef(false);
  const [playing, setPlaying] = useState(false);
  // The ~0.8s the frame takes to open. The poster overlay hides for it, or the
  // expansion would happen behind the thing you just tapped.
  const [opening, setOpening] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => {
      setPlaying(true);
      setOpening(false);
    };
    const onPause = () => setPlaying(false);
    const onMeta = () =>
      setDuration(Number.isFinite(video.duration) ? video.duration : null);
    const onError = () => {
      setOpening(false);
      setFailed(true);
      console.error(`[reel] could not load ${src}.`);
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onPause);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("error", onError);

    // This element is server-rendered, so the browser starts fetching metadata
    // before React hydrates — an unreachable file can fail before the listener
    // above exists, and the card would sit there offering a play button that
    // does nothing. Catch up on whatever already happened.
    if (video.error) onError();
    else if (video.readyState >= 1) onMeta();

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onPause);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onError);
    };
  }, [src]);

  function toggle() {
    const video = videoRef.current;
    if (!video || failed) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    // First play opens the frame; resuming after a pause should not replay the
    // whole reveal.
    if (opened.current) {
      void video.play().catch(() => {});
      return;
    }
    opened.current = true;
    setOpening(true);
    revealAndPlay(video);
  }

  return (
    <div className="relative mx-auto w-full max-w-[21rem]">
      {/* Soft glow behind the card so it lifts off the cream ground. */}
      <div
        aria-hidden
        className="absolute -inset-3 rounded-[2.25rem] bg-[radial-gradient(60%_50%_at_50%_10%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_70%)] blur-xl"
      />
      <figure className="relative overflow-hidden rounded-[1.75rem] bg-black shadow-[0_28px_70px_rgba(15,61,50,0.28)] ring-1 ring-forest/10">
        <video
          ref={videoRef}
          src={src}
          controls={playing}
          playsInline
          preload="metadata"
          className="aspect-[9/16] w-full bg-black object-cover"
        />

        {/* Poster-state overlay. Hidden once playing so it never covers the
            native controls, and hidden while the frame opens so the expansion
            is actually visible. */}
        {failed ? (
          <div className="absolute inset-0 grid place-items-center bg-[#0b2a22] px-6 text-center">
            <div>
              <VideoOff className="mx-auto size-7 text-white/50" aria-hidden />
              <p className="mt-3 text-[13px] font-semibold leading-snug text-white/85">
                This clip is temporarily unavailable.
              </p>
            </div>
          </div>
        ) : !playing && !opening ? (
          <button
            type="button"
            onClick={toggle}
            aria-label={`Play: ${label}`}
            className="group absolute inset-0 grid place-items-center bg-[linear-gradient(180deg,rgba(6,26,21,0.15)_0%,rgba(6,26,21,0.55)_100%)] transition"
          >
            <span className="grid size-16 place-items-center rounded-full bg-white/95 text-forest shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition group-hover:scale-105">
              <Play className="size-6 translate-x-0.5" aria-hidden />
            </span>
            <span className="absolute bottom-4 left-4 right-4 text-left text-[13px] font-semibold leading-snug text-white/95">
              {label}
            </span>
          </button>
        ) : playing ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Pause"
            className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/70"
          >
            <Pause className="size-4" aria-hidden />
          </button>
        ) : null}

        {/* Reel chrome: duration pill, top-left. */}
        {duration && !failed ? (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            {formatDuration(duration)}
          </span>
        ) : null}
      </figure>
    </div>
  );
}

function formatDuration(seconds: number) {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
