"use client";

import createGlobe from "cobe";
import { useEffect, useRef, useState } from "react";
import type { GlobeMarker } from "@/lib/marketing/globe-markers";

/**
 * Rotating, draggable globe for the hero.
 *
 * cobe rather than a three.js wrapper: it is a single WebGL canvas with no
 * scene graph, which is all this needs and a fraction of the bytes.
 *
 * The dotted-continent glow comes from cobe itself. The markers are plain
 * DOM avatars positioned over the canvas each frame, since the brief asks for
 * profile photos rather than flat dots.
 */
export function HeroGlobe({
  markers,
  placeholder,
}: {
  markers: GlobeMarker[];
  placeholder: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pinRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [ready, setReady] = useState(false);

  // Drag state lives in refs: it changes every pointer move and must not
  // re-render the tree.
  const rotation = useRef(0);
  const dragStartX = useRef<number | null>(null);
  const dragStartRotation = useRef(0);
  const autoSpin = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = wrap.clientWidth;
    let height = wrap.clientWidth;
    let frame = 0;

    const onResize = () => {
      width = wrap.clientWidth;
      height = wrap.clientWidth;
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(wrap);

    const globe = createGlobe(canvas, {
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      width: width * 2,
      height: height * 2,
      phi: 0,
      theta: 0.22,
      dark: 1,
      diffuse: 1.15,
      mapSamples: 16000,
      mapBrightness: 5.2,
      // Deep teal ground with cyan land dots and cyan marker glow.
      baseColor: [0.05, 0.14, 0.16],
      markerColor: [0.35, 0.95, 0.85],
      glowColor: [0.12, 0.42, 0.44],
      // No cobe markers: its dots are projected by its own shader and sat a
      // few pixels off the avatar pins overlaid below, which read as duplicate
      // markers. The avatars are the markers, and they carry their own glow.
      markers: [],
    });

    // cobe v2 has no onRender hook — the caller drives it with update().
    const THETA = 0.22;
    let painted = false;

    const tick = () => {
      if (autoSpin.current && !reduced) {
        rotation.current += 0.0022;
      }
      globe.update({
        phi: rotation.current,
        theta: THETA,
        width: width * 2,
        height: height * 2,
      });

      // Project each marker to screen space so its avatar tracks the globe.
      const radius = width / 2;
      for (let i = 0; i < markers.length; i += 1) {
        const pin = pinRefs.current[i];
        if (!pin) continue;
        const marker = markers[i];
        const latRad = (marker.lat * Math.PI) / 180;
        const lngRad = (marker.lng * Math.PI) / 180;
        const x = Math.cos(latRad) * Math.sin(lngRad + rotation.current);
        const y = Math.sin(latRad);
        const z = Math.cos(latRad) * Math.cos(lngRad + rotation.current);
        // Tilt on the y/z plane, matching cobe's theta.
        const yT = y * Math.cos(THETA) - z * Math.sin(THETA);
        const zT = y * Math.sin(THETA) + z * Math.cos(THETA);

        if (zT <= 0.02) {
          // Round the back of the globe.
          pin.style.opacity = "0";
          pin.style.pointerEvents = "none";
          continue;
        }
        const screenX = radius + x * radius * 0.92;
        const screenY = radius - yT * radius * 0.92;
        const depth = 0.55 + zT * 0.45;
        pin.style.opacity = String(Math.min(1, zT * 2.4));
        pin.style.pointerEvents = "auto";
        pin.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%) scale(${depth})`;
      }

      if (!painted) {
        painted = true;
        setReady(true);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      globe.destroy();
    };
  }, [markers]);

  function onPointerDown(event: React.PointerEvent) {
    dragStartX.current = event.clientX;
    dragStartRotation.current = rotation.current;
    autoSpin.current = false;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (dragStartX.current === null) return;
    const delta = event.clientX - dragStartX.current;
    rotation.current = dragStartRotation.current + delta / 180;
  }

  function onPointerUp() {
    dragStartX.current = null;
    autoSpin.current = true;
  }

  return (
    <div className="relative mx-auto w-full max-w-[34rem]">
      <div
        ref={wrapRef}
        className="relative aspect-square w-full cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Orbital rings, purely decorative. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[6%] rounded-full border border-cyan-300/15"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-2%] rotate-[18deg] rounded-full border border-cyan-300/10"
          style={{ transform: "rotate(18deg) scaleY(0.34)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-6%] rounded-full border border-cyan-300/[0.07]"
          style={{ transform: "rotate(-24deg) scaleY(0.52)" }}
        />

        <canvas
          ref={canvasRef}
          className="size-full transition-opacity duration-700"
          style={{ opacity: ready ? 1 : 0, contain: "layout paint size" }}
        />

        {/* Avatar pins, positioned by the rAF loop above. */}
        {markers.map((marker, index) => (
          <div
            key={`${marker.lat},${marker.lng}`}
            ref={(node) => {
              pinRefs.current[index] = node;
            }}
            className="absolute left-0 top-0 opacity-0 will-change-transform"
          >
            <span className="relative block">
              <span className="absolute -inset-1.5 animate-pulse rounded-full bg-cyan-300/25" />
              {/* Member avatars are arbitrary hosts, not optimizer inputs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={marker.avatarUrl}
                alt=""
                loading="lazy"
                className="relative size-7 rounded-full object-cover ring-2 ring-cyan-200/80"
              />
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-[11px] text-white/45">
        {placeholder
          ? "Drag to spin. Pins are stand-ins until the member map is imported."
          : "Drag to spin. Regions only — no names, no exact locations."}
      </p>
    </div>
  );
}
