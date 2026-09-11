/**
 * Opening a video by expanding it from a dot at the centre out to its full
 * frame, then starting playback.
 *
 * Done with `clip-path` rather than a transform scale: scaling means the
 * browser interpolates the footage up from a handful of pixels, which looks
 * soft for the first half-second. Clipping leaves every visible pixel at its
 * native size, so the frame opens sharp.
 *
 * The animation carries `animation-fill-mode: both`, so attaching the class is
 * enough to snap the element to the closed state — no separate "closed" class
 * that could be left behind if the reveal never runs.
 */

const OPEN_CLASS = "vu-video-open";

/** Matches the animation duration in globals.css. */
const OPEN_MS = 920;

export function revealAndPlay(video: HTMLVideoElement) {
  let settled = false;
  // Declared up front: the reduced-motion path settles before the fallback
  // timer is ever scheduled, and reading it in that state must not throw.
  let timer = 0;

  // Playback deliberately starts only once the frame is fully open, so the
  // expansion is never competing with motion inside the footage.
  const settle = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    video.removeEventListener("animationend", onEnd);
    video.classList.remove(OPEN_CLASS);
    // The pre-reveal state is an inline opacity of 0 on the hero; the animation
    // outranked it while running, so it has to be cleared by hand.
    video.style.opacity = "1";
    void video.play().catch(() => {});
  };

  const onEnd = (event: AnimationEvent) => {
    if (event.animationName === "vu-video-open") settle();
  };

  // Reduced motion: open instantly. The global reduced-motion rule already
  // collapses every animation to 0.01ms, so this only saves a frame of waiting
  // — but it also keeps the behaviour obvious rather than incidental.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    settle();
    return;
  }

  // Fallback in case animationend never arrives — a detached element, or a
  // browser that drops the event. Playback must not depend on it.
  timer = window.setTimeout(settle, OPEN_MS + 150);
  video.addEventListener("animationend", onEnd);
  video.classList.add(OPEN_CLASS);
}
