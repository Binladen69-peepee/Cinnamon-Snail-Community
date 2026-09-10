"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Full-bleed hero background video.
 *
 * Framing: `object-cover` is unavoidable for a full-bleed band, so the crop is
 * minimised instead of hidden — no upscale, and only a slight horizontal bias
 * so the subject sits beside the headline column rather than behind it. The
 * hero's own height is capped near 16:9 (see the page) so cover has little to
 * trim.
 *
 * Loading: the file is ~35 MB, so it is deliberately kept off the critical
 * path. The scrim and its forest ground paint immediately and are what the
 * headline is read against, so nothing about the hero's appearance waits on the
 * video; `src` is only attached after mount, once the element is on screen, and
 * only when the connection and the visitor's preferences suggest it is wanted.
 * The hero's height is fixed by the section, so attaching it later shifts
 * nothing.
 *
 * Treatment is deliberately light: no blur, so the footage reads sharp, with
 * legibility carried by the scrim plus the text shadow on the hero copy.
 */
export function HeroVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  // Decide whether to load at all, then wait until the hero is actually in
  // view. Both checks live outside render because neither changes the markup.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    type NetworkInformation = { saveData?: boolean; effectiveType?: string };
    const connection = (
      navigator as Navigator & { connection?: NetworkInformation }
    ).connection;
    const frugal =
      connection?.saveData === true ||
      (connection?.effectiveType !== undefined &&
        /(^|-)2g$/.test(connection.effectiveType));

    // A 35 MB decorative loop is not worth it on a metered or slow connection,
    // and prefers-reduced-motion means it would never play anyway.
    if (frugal || motion.matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSource(src);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [src]);

  // Playback, driven imperatively: nothing in the render output depends on it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let onScreen = true;

    const sync = () => {
      if (motion.matches || !onScreen) {
        if (!video.paused) video.pause();
        return;
      }
      // Autoplay can still be refused; a paused first frame is acceptable, so
      // the rejection is swallowed rather than surfaced.
      if (video.paused) void video.play().catch(() => {});
    };

    // Generous margin so scrolling past and back does not chop the loop.
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0, rootMargin: "300px 0px 300px 0px" },
    );
    observer.observe(video);
    motion.addEventListener("change", sync);

    const onReady = () => {
      setVisible(true);
      sync();
    };
    video.addEventListener("loadeddata", onReady);

    return () => {
      observer.disconnect();
      motion.removeEventListener("change", sync);
      video.removeEventListener("loadeddata", onReady);
    };
  }, [source]);

  return (
    <div ref={hostRef} aria-hidden className="absolute inset-0 overflow-hidden">
      {/* Painted immediately, and the ground the headline is read against, so
          first paint never waits on the video. */}
      <div className="absolute inset-0 bg-[#0b2a22]" />

      {source ? (
        <video
          ref={videoRef}
          src={source}
          muted
          loop
          autoPlay
          playsInline
          // Once we have committed to loading, buffer properly: a background
          // loop that is still fetching stalls mid-frame, which reads as the
          // video restarting.
          preload="auto"
          disablePictureInPicture
          tabIndex={-1}
          className="size-full object-cover object-[58%_center] opacity-0 transition-opacity duration-700 [filter:saturate(1.04)]"
          style={{ opacity: visible ? 1 : 0 }}
        />
      ) : null}

      {/* Scrim: keeps white type readable while letting the footage read. */}
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(9,36,29,0.8)_0%,rgba(9,36,29,0.62)_46%,rgba(9,36,29,0.3)_76%,rgba(9,36,29,0.16)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_95%_at_12%_25%,transparent_50%,rgba(6,26,21,0.4)_100%)]" />
      <div className="vu-grain absolute inset-0" />
    </div>
  );
}
