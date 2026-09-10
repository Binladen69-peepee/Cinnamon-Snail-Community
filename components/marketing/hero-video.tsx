"use client";

import { useEffect, useRef } from "react";

/**
 * Full-bleed hero background video.
 *
 * Autoplay/muted/loop, and treated so it reads as ambient texture rather than
 * a portrait competing with the headline: slight blur, lifted saturation, a
 * forest gradient scrim, and a grain overlay.
 *
 * Playback is driven imperatively — no React state mirrors the media query or
 * the intersection, because nothing in the render output depends on them.
 * Under prefers-reduced-motion the video stays paused on its first frame.
 */
export function HeroVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = true;

    const sync = () => {
      if (motionQuery.matches || !onScreen) {
        video.pause();
        return;
      }
      // Autoplay can still be refused; a paused first frame is an acceptable
      // outcome, so the rejection is swallowed rather than surfaced.
      void video.play().catch(() => {});
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0.05 },
    );
    observer.observe(video);
    motionQuery.addEventListener("change", sync);
    sync();

    return () => {
      observer.disconnect();
      motionQuery.removeEventListener("change", sync);
    };
  }, []);

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        tabIndex={-1}
        className="size-full scale-105 object-cover object-[72%_center] [filter:saturate(1.06)_blur(2px)]"
      />
      {/* Scrim: dark enough for AA-contrast white type at every breakpoint. */}
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(9,36,29,0.94)_0%,rgba(9,36,29,0.82)_42%,rgba(9,36,29,0.55)_72%,rgba(9,36,29,0.42)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_20%,transparent_38%,rgba(6,26,21,0.55)_100%)]" />
      <div className="vu-grain absolute inset-0" />
    </div>
  );
}
