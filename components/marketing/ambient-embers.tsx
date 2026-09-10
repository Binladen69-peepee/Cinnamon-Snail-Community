"use client";

import { useEffect, useRef } from "react";

type Ember = {
  x: number;
  y: number;
  radius: number;
  drift: number;
  speed: number;
  alpha: number;
  hue: number;
};

/**
 * Slow-drifting light particles behind the hero — the "embers" motion from the
 * Thanksgiving challenge page, kept soft rather than neon. Canvas rather than
 * DOM nodes so a few dozen particles cost nothing, and it stops painting
 * entirely under prefers-reduced-motion or when the tab is hidden.
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
    let embers: Ember[] = [];
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    function seed() {
      embers = Array.from({ length: density }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 1 + Math.random() * 2.4,
        drift: (Math.random() - 0.5) * 0.18,
        speed: 0.12 + Math.random() * 0.32,
        alpha: 0.18 + Math.random() * 0.4,
        // Warm greens through to apricot, matching the brand tokens.
        hue: 120 + Math.random() * 40,
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

    function draw() {
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

        const glow = context!.createRadialGradient(
          ember.x,
          ember.y,
          0,
          ember.x,
          ember.y,
          ember.radius * 4,
        );
        glow.addColorStop(0, `hsla(${ember.hue}, 60%, 55%, ${ember.alpha})`);
        glow.addColorStop(1, `hsla(${ember.hue}, 60%, 55%, 0)`);
        context!.fillStyle = glow;
        context!.beginPath();
        context!.arc(ember.x, ember.y, ember.radius * 4, 0, Math.PI * 2);
        context!.fill();
      }
      frame = requestAnimationFrame(draw);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    frame = requestAnimationFrame(draw);

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(frame);
      } else {
        frame = requestAnimationFrame(draw);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
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
