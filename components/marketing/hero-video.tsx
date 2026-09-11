"use client";

import { useEffect, useRef, useState } from "react";
import { revealAndPlay } from "@/lib/marketing/video-reveal";

/**
 * Full-bleed hero background video.
 *
 * Framing: `object-cover` is unavoidable for a full-bleed band, so the crop is
 * minimised instead of hidden — no upscale, and only a slight horizontal bias
 * so the subject sits beside the headline column rather than behind it.
 *
 * Loading: the scrim and its forest ground paint immediately and are what the
 * headline is read against, so nothing about the hero's appearance waits on the
 * video. `src` is attached after mount, once the element is on screen, and only
 * when the connection and the visitor's preferences suggest it is wanted. The
 * section fixes its own height, so attaching later shifts nothing.
 *
 * Playback: the frame opens from a dot at the centre out to full bleed and
 * playback starts when that finishes, so the reveal is never competing with
 * motion inside the footage. `autoPlay` is deliberately absent — it would start
 * the video behind the closed frame.
 *
 * Treatment is deliberately light: no blur, so the footage reads sharp, with
 * legibility carried by the scrim plus the text shadow on the hero copy.
 */
export function HeroVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

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

    // A decorative loop is not worth a metered or slow connection, and
    // prefers-reduced-motion means it would never play anyway.
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
    let opened = false;

    const sync = () => {
      // Until the frame has opened, the reveal owns playback.
      if (!opened) return;
      if (motion.matches || !onScreen) {
        if (!video.paused) video.pause();
        return;
      }
      // Autoplay can still be refused; a paused frame is acceptable, so the
      // rejection is swallowed rather than surfaced.
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

    // Open the frame as soon as there are real pixels behind it.
    const onReady = () => {
      if (opened) return;
      opened = true;
      revealAndPlay(video);
    };
    video.addEventListener("loadeddata", onReady);
    // A cached source can reach HAVE_CURRENT_DATA before the listener attaches.
    if (video.readyState >= 2) onReady();

    return () => {
      observer.disconnect();
      motion.removeEventListener("change", sync);
      video.removeEventListener("loadeddata", onReady);
    };
  }, [source]);

  return (
    <div ref={hostRef} aria-hidden className="absolute inset-0 overflow-hidden">
      {/* Painted immediately, and the ground the headline is read against, so
          first paint never waits on the video. It is also the fallback: if the
          file cannot be fetched, the hero reads exactly as it does before the
          video arrives rather than showing a broken frame. */}
      <div className="absolute inset-0 bg-[#0b2a22]" />

      {source && !failed ? (
        <video
          ref={videoRef}
          src={source}
          muted
          loop
          playsInline
          // Once we have committed to loading, buffer properly: a background
          // loop that is still fetching stalls mid-frame, which reads as the
          // video restarting.
          preload="auto"
          disablePictureInPicture
          tabIndex={-1}
          onError={() => {
            setFailed(true);
            // A background video that silently never appears is very hard to
            // tell apart from one that was never wired up, so say so. This is
            // how an unreachable file should announce itself.
            console.error(
              `[hero-video] could not load ${source} — the hero is falling back to its flat ground.`,
            );
          }}
          className="size-full object-cover object-[58%_center] [filter:saturate(1.04)]"
          // Pre-reveal state; the reveal animation outranks it, then clears it.
          style={{ opacity: 0 }}
        />
      ) : null}

      {/* Scrim: keeps white type readable while letting the footage read. */}
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(9,36,29,0.8)_0%,rgba(9,36,29,0.62)_46%,rgba(9,36,29,0.3)_76%,rgba(9,36,29,0.16)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_95%_at_12%_25%,transparent_50%,rgba(6,26,21,0.4)_100%)]" />
      <div className="vu-grain absolute inset-0" />
    </div>
  );
}
