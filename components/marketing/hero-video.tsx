"use client";

import { useEffect, useRef } from "react";

/**
 * Full-bleed hero background video.
 *
 * Framing: `object-cover` is unavoidable for a full-bleed band, so the crop is
 * minimised instead of hidden — no upscale, and only a slight horizontal bias
 * so the subject sits beside the headline column rather than behind it. The
 * hero's own height is capped near 16:9 (see the page) so cover has little to
 * trim.
 *
 * Treatment is deliberately light: a heavy blur both washed the footage out and
 * made compositing expensive enough to stutter a 1080p decode. A small blur
 * plus the scrim is enough to keep white type readable.
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
        if (!video.paused) video.pause();
        return;
      }
      // Autoplay can still be refused; a paused first frame is an acceptable
      // outcome, so the rejection is swallowed rather than surfaced.
      if (video.paused) void video.play().catch(() => {});
    };

    // Generous margin: the hero stays playing until it is well clear of the
    // viewport, so scrolling past and back does not chop the loop.
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0, rootMargin: "300px 0px 300px 0px" },
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
        autoPlay
        playsInline
        // `auto` rather than `metadata`: a background loop that is still
        // fetching stalls mid-frame, which reads as the video restarting.
        preload="auto"
        disablePictureInPicture
        tabIndex={-1}
        className="size-full object-cover object-[58%_center] [filter:saturate(1.05)_blur(0.5px)]"
      />
      {/* Scrim: keeps white type at AA contrast while letting the footage read.
          Lighter than before, since the video should be visible texture. */}
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(9,36,29,0.86)_0%,rgba(9,36,29,0.7)_44%,rgba(9,36,29,0.38)_74%,rgba(9,36,29,0.24)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_95%_at_12%_25%,transparent_45%,rgba(6,26,21,0.45)_100%)]" />
      <div className="vu-grain absolute inset-0" />
    </div>
  );
}
