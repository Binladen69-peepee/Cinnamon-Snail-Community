"use client";

import { useEffect, useRef, useState } from "react";
import type { GlobeMarker } from "@/lib/marketing/globe-markers";
import { LAND_RINGS } from "@/lib/marketing/land-rings";
import { cn } from "@/lib/utils";

/**
 * Rotating, draggable globe of member geography — drawn, not plotted.
 *
 * ## Why this is not cobe any more
 *
 * The previous globe was cobe, which renders land as a grid of glowing dots.
 * The client's note was that it read "techie", which it did: bright cyan
 * stipple on a dark sphere with an atmospheric halo is the house style of
 * every crypto landing page there has ever been.
 *
 * That dot grid is cobe's shader and cannot be turned off. Three things were
 * tried before replacing it — inverting the brightness so land was darker than
 * the sphere, flooding it with samples so the dots touched, and rendering
 * small then upscaling so they blurred together. All three produced moire
 * interference rather than coastlines: swirling concentric rings that looked
 * like a fingerprint, because what was being smoothed was the sampling
 * pattern, not a map. There is no setting that turns a dot matrix into a
 * brush stroke.
 *
 * So the land is real geometry now: Natural Earth coastlines in
 * `land-rings.ts`, projected orthographically and filled as paths on a 2D
 * canvas. That is what makes a painterly treatment possible at all — you can
 * only give a shape a soft edge if you have the shape.
 *
 * It is also smaller and cheaper. The ring data is about 4KB gzipped against
 * cobe's ~30KB, there is no WebGL context to create, and a frame is 900 points
 * of trigonometry instead of tens of thousands of instanced quads.
 *
 * ## Making it look painted
 *
 * - Coastlines are displaced by a hash of their own index, so every edge is
 *   slightly off true in a way that is *stable*. Per-frame randomness would
 *   boil and shimmer as the globe turned; this holds still and just reads as
 *   a hand that was not quite steady.
 * - Land is filled translucent and stroked soft, twice, at slightly different
 *   offsets. Where the passes overlap they darken, which is how pigment
 *   actually behaves and why watercolour has those denser seams.
 * - The sphere is warm paper with light falling from the upper left, and it
 *   darkens towards the limb the way a wash pools where it dries.
 * - No halo, no orbital rings, no terminator.
 *
 * The interaction, the lazy start, the offscreen pause and the photo pins are
 * all unchanged.
 */
export function MemberGlobe({
  markers,
  placeholder,
  captionClassName,
}: {
  markers: GlobeMarker[];
  placeholder: boolean;
  captionClassName?: string;
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
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let size = wrap.clientWidth;
    let frame = 0;

    const resize = () => {
      size = wrap.clientWidth;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    };
    resize();
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(wrap);

    // Matches the tilt the pins are projected with below.
    const THETA = 0.22;
    let painted = false;

    const tick = () => {
      if (autoSpin.current && !reduced) {
        rotation.current += 0.0016;
      }
      drawGlobe(context, canvas.width, canvas.height, rotation.current, THETA);

      // Project each marker to screen space so its pin tracks the globe.
      const radius = size / 2;
      for (let i = 0; i < markers.length; i += 1) {
        const pin = pinRefs.current[i];
        if (!pin) continue;
        const marker = markers[i];
        const latRad = (marker.lat * Math.PI) / 180;
        const lngRad = (marker.lng * Math.PI) / 180;
        const x = Math.cos(latRad) * Math.sin(lngRad + rotation.current);
        const y = Math.sin(latRad);
        const z = Math.cos(latRad) * Math.cos(lngRad + rotation.current);
        // Tilt on the y/z plane, matching THETA above.
        const yT = y * Math.cos(THETA) - z * Math.sin(THETA);
        const zT = y * Math.sin(THETA) + z * Math.cos(THETA);

        if (zT <= 0.02) {
          // Round the back of the globe.
          pin.style.opacity = "0";
          pin.style.pointerEvents = "none";
          continue;
        }
        const screenX = radius + x * radius * GLOBE_FILL;
        const screenY = radius - yT * radius * GLOBE_FILL;
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
        <canvas
          ref={canvasRef}
          className="size-full transition-opacity duration-700"
          style={{ opacity: ready ? 1 : 0, contain: "layout paint size" }}
        />

        {/* Paper tooth. Sits over the sphere, clipped to it, multiplying so it
            darkens the fibres rather than fogging the whole disc. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full mix-blend-multiply"
          style={{
            opacity: ready ? 0.45 : 0,
            transition: "opacity 700ms",
            backgroundImage: `url("data:image/svg+xml,${PAPER}")`,
            backgroundSize: "150% 150%",
            backgroundPosition: "42% 38%",
          }}
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
            <MapPin place={marker.place} />
          </div>
        ))}
      </div>

      <p className={cn("mt-5 text-center text-xs", captionClassName ?? "text-olive")}>
        {placeholder
          ? "Drag to spin. Pins are stand-ins until the member map is imported."
          : "Drag to spin. Regions only — no names, no exact locations."}
      </p>
    </div>
  );
}

/** How much of the canvas the sphere occupies, leaving room for the soft edge. */
const GLOBE_FILL = 0.92;

/**
 * Paper tooth, as an inline SVG data URI. Fine turbulence at low opacity —
 * the scale of fibres in cold-press paper, not of film grain.
 */
const PAPER = encodeURIComponent(
  [
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">',
    '<filter id="p">',
    '<feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" seed="11"/>',
    '<feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.26  0.35 0.2 0 0 0.55"/>',
    "</filter>",
    '<rect width="300" height="300" filter="url(#p)"/>',
    "</svg>",
  ].join(""),
);

/**
 * A stable pseudo-random offset for a coastline point.
 *
 * Deterministic in the point's identity rather than in time: the same vertex
 * gets the same wobble on every frame, so the coast holds still while the
 * globe turns. Seeded per ring as well as per point so two coastlines that
 * happen to share a latitude do not wobble in step.
 */
function jitter(ring: number, index: number): [number, number] {
  const h = Math.sin(ring * 127.1 + index * 311.7) * 43758.5453;
  const k = Math.sin(ring * 269.5 + index * 183.3) * 24634.6345;
  return [((h - Math.floor(h)) - 0.5) * 0.55, ((k - Math.floor(k)) - 0.5) * 0.55];
}

/** Warm paper, forest ink. Kept here so the whole palette reads in one place. */
const PALETTE = {
  paperLit: "#fbf3e6",
  paperMid: "#f2e6d2",
  paperEdge: "#e2d0b6",
  limb: "rgba(120, 92, 62, 0.26)",
  landFill: "rgba(0,0,0, 0.72)",
  landFillDeep: "rgba(0,0,0, 0.55)",
  landEdge: "rgba(0,0,0, 0.55)",
};

/**
 * One frame: paper sphere, then coastlines, then the damp edge.
 *
 * Everything is clipped to the sphere, so a continent rounding the limb is cut
 * by the horizon rather than running off into the panel.
 */
function drawGlobe(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  phi: number,
  theta: number,
) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = (Math.min(width, height) / 2) * GLOBE_FILL;

  context.clearRect(0, 0, width, height);
  context.save();
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.clip();

  // The sphere: light from the upper left, pooling warm at the lower right.
  const paper = context.createRadialGradient(
    cx - radius * 0.32,
    cy - radius * 0.36,
    radius * 0.08,
    cx,
    cy,
    radius * 1.06,
  );
  paper.addColorStop(0, PALETTE.paperLit);
  paper.addColorStop(0.55, PALETTE.paperMid);
  paper.addColorStop(1, PALETTE.paperEdge);
  context.fillStyle = paper;
  context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Two passes, nudged apart. The offset is what makes the overlap darken.
  const passes: Array<{ dx: number; dy: number; fill: string; stroke: number }> = [
    { dx: 0, dy: 0, fill: PALETTE.landFill, stroke: 1.6 },
    { dx: radius * 0.003, dy: radius * 0.004, fill: PALETTE.landFillDeep, stroke: 0 },
  ];

  context.lineJoin = "round";
  context.lineCap = "round";

  for (const pass of passes) {
    context.fillStyle = pass.fill;
    context.strokeStyle = PALETTE.landEdge;
    context.lineWidth = Math.max(1, radius * 0.004);

    for (let r = 0; r < LAND_RINGS.length; r += 1) {
      const ring = LAND_RINGS[r];

      // Project the whole ring first, then draw it as one smooth curve.
      // Simplification left these coastlines faceted, and straight segments
      // between them read as low-poly game terrain; curves through the same
      // points read as a drawn line and cost nothing extra to store.
      const count = ring.length / 2;
      const px: number[] = [];
      const py: number[] = [];
      for (let i = 0; i < ring.length; i += 2) {
        const [jx, jy] = jitter(r, i);
        const lon = ((ring[i] + jx) * Math.PI) / 180;
        const lat = ((ring[i + 1] + jy) * Math.PI) / 180;

        const cosLat = Math.cos(lat);
        let x = cosLat * Math.sin(lon + phi);
        const y0 = Math.sin(lat);
        const z0 = cosLat * Math.cos(lon + phi);
        let y = y0 * cosT - z0 * sinT;
        const z = y0 * sinT + z0 * cosT;

        // Behind the horizon: pin the point to the limb instead of dropping
        // it, so the path stays closed and the shape is cut by the clip above
        // rather than collapsing into a spike across the globe.
        if (z <= 0) {
          const len = Math.hypot(x, y) || 1;
          x /= len;
          y /= len;
        }

        px.push(cx + x * radius + pass.dx);
        py.push(cy - y * radius + pass.dy);
      }

      // Quadratic segments between successive midpoints, with the original
      // vertices as control points. Every join is tangent-continuous, so the
      // outline has no corners anywhere.
      context.beginPath();
      context.moveTo((px[count - 1] + px[0]) / 2, (py[count - 1] + py[0]) / 2);
      for (let i = 0; i < count; i += 1) {
        const next = (i + 1) % count;
        context.quadraticCurveTo(
          px[i],
          py[i],
          (px[i] + px[next]) / 2,
          (py[i] + py[next]) / 2,
        );
      }
      context.closePath();
      context.fill();
      if (pass.stroke) context.stroke();
    }
  }

  // Damp edge: pigment dries darker where it meets the boundary, and this is
  // also what keeps the sphere from ending on a hard mechanical circle.
  const limb = context.createRadialGradient(cx, cy, radius * 0.62, cx, cy, radius);
  limb.addColorStop(0, "rgba(120, 92, 62, 0)");
  limb.addColorStop(0.82, "rgba(120, 92, 62, 0.1)");
  limb.addColorStop(1, PALETTE.limb);
  context.fillStyle = limb;
  context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  context.restore();
}

/**
 * A small forest teardrop pin. Faces live on the polaroid cards around the
 * globe, from real class stills — not a repeated crew photo on every pin.
 */
function MapPin({ place }: { place: string }) {
  return (
    <span className="relative block" title={place}>
      <svg
        viewBox="0 0 24 32"
        className="h-7 w-auto drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]"
        role="img"
        aria-label={place}
      >
        <path
          d="M12 31C12 31 2 18.8 2 11.2A10 10 0 0 1 22 11.2C22 18.8 12 31 12 31Z"
          className="fill-foreground stroke-background"
          strokeWidth="1.4"
        />
        <circle cx="12" cy="11" r="3.4" className="fill-background" />
      </svg>
    </span>
  );
}
