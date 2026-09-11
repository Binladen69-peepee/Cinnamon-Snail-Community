import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revealAndPlay } from "@/lib/marketing/video-reveal";

/**
 * A stand-in for the bits of HTMLVideoElement that revealAndPlay touches.
 * The suite runs in the node environment, so there is no real DOM.
 */
function fakeVideo() {
  const classes = new Set<string>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const played: number[] = [];

  return {
    classList: {
      add: (name: string) => classes.add(name),
      remove: (...names: string[]) => names.forEach((n) => classes.delete(n)),
      has: (name: string) => classes.has(name),
    },
    style: { opacity: "0" },
    play: () => {
      played.push(Date.now());
      return Promise.resolve();
    },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
    /** Test helpers. */
    _classes: classes,
    _playCount: () => played.length,
    _fire: (type: string, event: unknown) => {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
    },
    _listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

type Fake = ReturnType<typeof fakeVideo>;

/** Casting through unknown: the fake only implements what is exercised. */
const asVideo = (video: Fake) => video as unknown as HTMLVideoElement;

let reduced = false;

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      matchMedia: () => ({ matches: reduced }),
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, "window");
});

describe("revealAndPlay", () => {
  it("opens the frame before starting playback, never alongside it", () => {
    const video = fakeVideo();
    revealAndPlay(asVideo(video));

    // The whole point: the frame is expanding and the video is still paused.
    expect(video._classes.has("vu-video-open")).toBe(true);
    expect(video._playCount()).toBe(0);

    video._fire("animationend", { animationName: "vu-video-open" });

    expect(video._playCount()).toBe(1);
    // The class is cleared so the element carries no animation once open.
    expect(video._classes.has("vu-video-open")).toBe(false);
    expect(video.style.opacity).toBe("1");
  });

  it("ignores an animationend from some other animation on the element", () => {
    const video = fakeVideo();
    revealAndPlay(asVideo(video));

    video._fire("animationend", { animationName: "leaf-float" });

    expect(video._playCount()).toBe(0);
    expect(video._classes.has("vu-video-open")).toBe(true);
  });

  it("plays anyway if animationend never arrives", () => {
    const video = fakeVideo();
    revealAndPlay(asVideo(video));

    vi.advanceTimersByTime(2000);

    expect(video._playCount()).toBe(1);
    expect(video._classes.has("vu-video-open")).toBe(false);
  });

  it("only plays once, even if the fallback and the event both land", () => {
    const video = fakeVideo();
    revealAndPlay(asVideo(video));

    video._fire("animationend", { animationName: "vu-video-open" });
    vi.advanceTimersByTime(2000);

    expect(video._playCount()).toBe(1);
    // And it stops listening, so a later stray event cannot replay it.
    expect(video._listenerCount("animationend")).toBe(0);
  });

  it("skips the expansion under prefers-reduced-motion", () => {
    reduced = true;
    const video = fakeVideo();
    revealAndPlay(asVideo(video));

    expect(video._playCount()).toBe(1);
    expect(video._classes.has("vu-video-open")).toBe(false);
    expect(video.style.opacity).toBe("1");
  });
});
