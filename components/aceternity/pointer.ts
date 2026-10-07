/**
 * One pointer listener for every effect that follows the cursor.
 *
 * Aceternity's glowing effect adds a pointermove and a scroll listener per
 * card. Here the first subscriber adds a single passive, delegated listener on
 * the document, the last one to leave removes it, and the subscribers hear
 * about the pointer at most once per animation frame, all in the same frame.
 *
 * Touch is ignored: the effects that use this are hover effects, and a finger
 * scrolling a list should not light up every card it passes.
 */

export type PointerPoint = { x: number; y: number };
type Listener = (point: PointerPoint) => void;

const listeners = new Set<Listener>();
let latest: PointerPoint | null = null;
let frame = 0;

function flush() {
  frame = 0;
  const point = latest;
  if (!point) return;
  for (const listener of listeners) listener(point);
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType === "touch") return;
  latest = { x: event.clientX, y: event.clientY };
  if (!frame) frame = requestAnimationFrame(flush);
}

/** Calls `listener` with the pointer's position, at most once per frame. */
export function subscribePointer(listener: Listener): () => void {
  if (typeof document === "undefined") return () => {};
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("pointermove", onPointerMove, { passive: true });
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size > 0) return;
    document.removeEventListener("pointermove", onPointerMove);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    latest = null;
  };
}
