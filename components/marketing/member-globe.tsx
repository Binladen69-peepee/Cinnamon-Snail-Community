"use client";

import createGlobe from "cobe";
import { useEffect, useId, useRef, useState } from "react";
import type { GlobeMarker } from "@/lib/marketing/globe-markers";

/**
 * Rotating, draggable globe of member geography.
 *
 * cobe rather than a three.js wrapper: it is a single WebGL canvas with no
 * scene graph, which is all this needs and a fraction of the bytes.
 *
 * The dotted-continent glow comes from cobe itself. The markers are plain DOM
 * map pins positioned over the canvas each frame — cobe's own markers are flat
 * dots drawn by its shader, and they cannot carry a photo.
 *
 * Cost control, since this sits well below the fold on both sales pages:
 *  - nothing is built until the panel is near the viewport. Creating the WebGL
 *    context and generating the sample map is the expensive part, and it used
 *    to happen during page load for a section most visitors had not reached.
 *  - the render loop stops when the globe scrolls out of view or the tab is
 *    hidden, and resumes where it left off. Spinning a globe nobody is looking
 *    at cost a frame's work sixty times a second for the whole visit.
 */
export function MemberGlobe({
  markers,
  placeholder,
}: {
  markers: GlobeMarker[];
  placeholder: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pinRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);

  // Drag state lives in refs: it changes on every pointer move and must not
  // re-render the tree.
  const rotation = useRef(0);
  const dragStartX = useRef<number | null>(null);
  const dragStartRotation = useRef(0);
  const autoSpin = useRef(true);

  // Hold off building anything until the panel is close to the viewport.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = wrap.clientWidth;
    let frame = 0;

    const onResize = () => {
      width = wrap.clientWidth;
    };
    const sizeObserver = new ResizeObserver(onResize);
    sizeObserver.observe(wrap);

    const globe = createGlobe(canvas, {
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.22,
      dark: 1,
      diffuse: 1.15,
      // 13k samples rather than 18k: the dot grid is indistinguishable at this
      // size and it is meaningfully quicker to generate.
      mapSamples: 13000,
      mapBrightness: 5.4,
      // Deep teal ground with cyan land dots and a cyan atmosphere.
      baseColor: [0.05, 0.14, 0.16],
      markerColor: [0.35, 0.95, 0.85],
      glowColor: [0.12, 0.42, 0.44],
      // No cobe markers: its dots are projected by its own shader and sit a few
      // pixels off the pins overlaid below, which reads as duplicate markers.
      // The pins are the markers, and they carry the photo.
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
        height: width * 2,
      });

      // Project each marker to screen space so its pin tracks the globe.
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
        const depth = 0.62 + zT * 0.38;
        pin.style.opacity = String(Math.min(1, zT * 2.4));
        pin.style.pointerEvents = "auto";
        // translate(-50%, -100%) puts the pin's point on the coordinate, which
        // is how a map pin is meant to sit.
        pin.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -100%) scale(${depth})`;
      }

      if (!painted) {
        painted = true;
        setReady(true);
      }
      frame = requestAnimationFrame(tick);
    };
    let onScreen = true;
    let running = false;

    function start() {
      if (running || document.hidden || !onScreen) return;
      running = true;
      frame = requestAnimationFrame(tick);
    }

    function stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(frame);
    }

    // Narrower margin than the build trigger above, so the globe has already
    // been drawn by the time it starts spinning.
    const viewObserver = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) start();
        else stop();
      },
      { rootMargin: "100px" },
    );
    viewObserver.observe(wrap);

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      stop();
      sizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      globe.destroy();
    };
  }, [markers, started]);

  function onPointerDown(event: React.PointerEvent) {
    dragStartX.current = event.clientX;
    dragStartRotation.current = rotation.current;
    autoSpin.current = false;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (dragStartX.current === null) return;
    const delta = event.clientX - dragStartX.current;
    rotation.current = dragStartRotation.current + delta / 200;
  }

  function onPointerUp() {
    dragStartX.current = null;
    autoSpin.current = true;
  }

  return (
    <div className="w-full">
      <div
        ref={wrapRef}
        className="relative mx-auto aspect-square w-full cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Orbital rings, purely decorative. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[4%] rounded-full border border-cyan-300/15"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-3%] rounded-full border border-cyan-300/10"
          style={{ transform: "rotate(18deg) scaleY(0.32)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-8%] rounded-full border border-cyan-300/[0.07]"
          style={{ transform: "rotate(-24deg) scaleY(0.5)" }}
        />

        <canvas
          ref={canvasRef}
          className="size-full transition-opacity duration-700"
          style={{ opacity: ready ? 1 : 0, contain: "layout paint size" }}
        />

        {/* Map pins, positioned by the rAF loop above. */}
        {markers.map((marker, index) => (
          <div
            key={`${marker.lat},${marker.lng}`}
            ref={(node) => {
              pinRefs.current[index] = node;
            }}
            className="absolute left-0 top-0 opacity-0 will-change-transform"
          >
            <MapPin avatarUrl={marker.avatarUrl} place={marker.place} />
          </div>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-paper/50">
        {placeholder
          ? "Drag to spin. Pins are stand-ins until the member map is imported."
          : "Drag to spin. Regions only — no names, no exact locations."}
      </p>
    </div>
  );
}

/**
 * A teardrop map pin with the member's photo set into its head.
 *
 * Drawn as SVG rather than a rotated CSS square so the point is genuinely
 * pointed and the photo can be clipped to a true circle without having to be
 * counter-rotated.
 */
function MapPin({ avatarUrl, place }: { avatarUrl: string; place: string }) {
  const clipId = useId();

  return (
    <span className="relative block" title={place}>
      <svg
        viewBox="0 0 44 58"
        className="h-[3.25rem] w-auto drop-shadow-[0_6px_10px_rgba(2,20,18,0.55)]"
        role="img"
        aria-label={place}
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx="22" cy="20" r="13.5" />
          </clipPath>
        </defs>

        {/* Teardrop body: round head tapering to a point at the bottom. */}
        <path
          d="M22 57C22 57 3 34.6 3 20.6A19 19 0 0 1 41 20.6C41 34.6 22 57 22 57Z"
          fill="#0d3b36"
          stroke="rgb(103 232 219)"
          strokeWidth="2"
        />
        {/* Photo well, so a transparent avatar never shows the body through. */}
        <circle cx="22" cy="20" r="13.5" fill="#062725" />
        <image
          href={avatarUrl}
          x="8.5"
          y="6.5"
          width="27"
          height="27"
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
        {/* Frame ring over the photo edge. */}
        <circle
          cx="22"
          cy="20"
          r="13.5"
          fill="none"
          stroke="rgb(165 243 252)"
          strokeWidth="1.6"
        />
      </svg>
    </span>
  );
}
