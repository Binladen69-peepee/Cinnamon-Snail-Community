"use client";

import { useEffect, useRef } from "react";

type Ember = {
  x: number;
  y: number;
  radius: number;
  drift: number;
  speed: number;
  alpha: number;
  /** Index into the pre-rendered sprite set. */
  tint: number;
};

/** Warm greens through to apricot, matching the brand tokens. */
const TINTS = [120, 130, 140, 150, 160];

/** Sprites are drawn once at this size and scaled down per ember. */
const SPRITE = 48;

/**
 * Embers drift about a third of a pixel per frame, so painting them 60 times a
 * second renders the same picture twice. Half the frames, none of the
 * difference.
 */
const FPS = 30;
const FRAME_MS = 1000 / FPS;

/**
 * Slow-drifting light particles behind the hero — the "embers" motion from the
 * Thanksgiving challenge page, kept soft rather than neon.
 *
 * Each ember is a pre-rendered sprite blitted with `drawImage`, not a radial
 * gradient built on the fly: a gradient per ember per frame meant allocating
 * upwards of a thousand gradient objects a second, which is most of what this
 * effect used to cost. The glow is now built five times, at mount.
 *
 * It stops painting entirely under prefers-reduced-motion, when the tab is
 * hidden, and when the hero has scrolled out of view — an invisible canvas
 * repainting is pure waste, and this one sits at the top of a long page.
 */
export function AmbientEmbers({ density = 26 }: { density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let embers: Ember[] = [];
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    // One soft glow per tint, rendered once and reused for every ember.
    const sprites = TINTS.map((hue) => {
      const sprite = document.createElement("canvas");
      sprite.width = SPRITE;
      sprite.height = SPRITE;
      const paint = sprite.getContext("2d");
      if (paint) {
        const half = SPRITE / 2;
        const glow = paint.createRadialGradient(half, half, 0, half, half, half);
        glow.addColorStop(0, `hsla(${hue}, 60%, 55%, 1)`);
        glow.addColorStop(1, `hsla(${hue}, 60%, 55%, 0)`);
        paint.fillStyle = glow;
        paint.fillRect(0, 0, SPRITE, SPRITE);
      }
      return sprite;
    });

    function seed() {
      embers = Array.from({ length: density }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 1 + Math.random() * 2.4,
        drift: (Math.random() - 0.5) * 0.18,
        speed: 0.12 + Math.random() * 0.32,
        alpha: 0.18 + Math.random() * 0.4,
        tint: Math.floor(Math.random() * TINTS.length),
      }));
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      seed();
    }

    function draw(now: number) {
      frame = requestAnimationFrame(draw);
      // Throttle to FPS. rAF still fires at display rate; this skips the paint.
      if (now - last < FRAME_MS) return;
      last = now;

      context!.clearRect(0, 0, width, height);
      for (const ember of embers) {
        ember.y -= ember.speed;
        ember.x += ember.drift;
        if (ember.y < -8) {
          ember.y = height + 8;
          ember.x = Math.random() * width;
        }
        if (ember.x < -8) ember.x = width + 8;
        if (ember.x > width + 8) ember.x = -8;

        const size = ember.radius * 8;
        context!.globalAlpha = ember.alpha;
        context!.drawImage(
          sprites[ember.tint],
          ember.x - size / 2,
          ember.y - size / 2,
          size,
          size,
        );
      }
      context!.globalAlpha = 1;
    }

    let onScreen = true;
    let running = false;

    function start() {
      if (running || document.hidden || !onScreen) return;
      running = true;
      last = 0;
      frame = requestAnimationFrame(draw);
    }

    function stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
    }

    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(canvas);
    resize();

    // Only paint while the canvas is actually on screen.
    const viewObserver = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) start();
        else stop();
      },
      { rootMargin: "100px" },
    );
    viewObserver.observe(canvas);

    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      stop();
      sizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
}
