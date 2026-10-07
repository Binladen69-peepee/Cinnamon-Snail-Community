"use client";

import { useEffect } from "react";

/**
 * Moves the glow around a field's frame: Aceternity's input, whose border
 * lights up in the brand colour wherever the pointer is.
 *
 * The stylesheet does the painting ("App fields" in app/globals.css): a
 * radial gradient at `--mx --my` with radius `--glow-r`, drawn in the field's
 * frame (its border and the pixel inside it). This only says where the
 * pointer is. One delegated listener on the
 * document serves every field built from `fieldClass`, including the ones
 * that mount later (a dialog's, a composer's), so no field needs a wrapper, a
 * ref or a hook of its own. Mounted once, by the member and console layouts.
 *
 * - The pointer is read on every event but written at most once a frame.
 * - Moving outside a field costs a type check: nothing is looked up until a
 *   pointer enters one.
 * - On leaving, only the radius is cleared, so the glow shrinks where it was
 *   (`--glow-r` is a registered property and eases back to 0).
 * - Nothing happens for a touch, on a screen that cannot hover at all, or
 *   over a disabled field.
 */

export const FIELD_SELECTOR = ".vu-field";

/** Aceternity's radius for the glow. */
export const GLOW_RADIUS = "100px";

/** The events, all three handled by the one listener. */
export const GLOW_EVENTS = ["pointerover", "pointermove", "pointerout"] as const;

/** Captured, so a component that stops propagation cannot strand a glow. */
const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

export type GlowEnvironment = {
  document: Pick<Document, "addEventListener" | "removeEventListener">;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
};

function fieldAt(target: EventTarget | null): HTMLElement | null {
  const element = target as Element | null;
  if (!element || typeof element.closest !== "function") return null;
  return element.closest<HTMLElement>(FIELD_SELECTOR);
}

function isDisabled(field: HTMLElement): boolean {
  return field.matches(":disabled") || field.getAttribute("aria-disabled") === "true";
}

/**
 * Starts following the pointer and returns the function that stops it. Kept
 * apart from the component so it can be driven without a browser.
 */
export function attachFieldGlow(env: GlowEnvironment): () => void {
  let field: HTMLElement | null = null;
  let x = 0;
  let y = 0;
  let frame = 0;

  const clear = () => {
    field?.style.removeProperty("--glow-r");
    field = null;
  };

  const paint = () => {
    frame = 0;
    if (!field) return;
    // It may have been disabled since the pointer came in (a form sending).
    if (isDisabled(field)) {
      clear();
      return;
    }
    const box = field.getBoundingClientRect();
    field.style.setProperty("--mx", `${Math.round(x - box.left)}px`);
    field.style.setProperty("--my", `${Math.round(y - box.top)}px`);
    field.style.setProperty("--glow-r", GLOW_RADIUS);
  };

  const follow = (event: PointerEvent) => {
    x = event.clientX;
    y = event.clientY;
    if (!frame) frame = env.requestAnimationFrame(paint);
  };

  const onPointer = (event: Event) => {
    const pointer = event as PointerEvent;
    if (pointer.pointerType === "touch") return;

    if (pointer.type === "pointermove") {
      if (field) follow(pointer);
      return;
    }

    if (pointer.type === "pointerout") {
      // Into a child of the same field (an editor's paragraph) is not out.
      if (field && !field.contains(pointer.relatedTarget as Node | null)) clear();
      return;
    }

    // pointerover: the pointer has entered something, maybe a field.
    const next = fieldAt(pointer.target);
    if (next !== field) {
      clear();
      if (next && !isDisabled(next)) field = next;
    }
    if (field) follow(pointer);
  };

  for (const type of GLOW_EVENTS) {
    env.document.addEventListener(type, onPointer, LISTENER_OPTIONS);
  }

  return () => {
    for (const type of GLOW_EVENTS) {
      env.document.removeEventListener(type, onPointer, LISTENER_OPTIONS);
    }
    if (frame) env.cancelAnimationFrame(frame);
    frame = 0;
    clear();
  };
}

/** Renders nothing; attaches the listener while a pointer that can hover exists. */
export function FieldGlow() {
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    // A phone has no hover; a laptop with a touch screen still does.
    const canHover = window.matchMedia("(any-hover: hover)");
    let detach: (() => void) | null = null;

    const sync = () => {
      detach?.();
      detach = canHover.matches
        ? attachFieldGlow({
            document,
            requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
            cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
          })
        : null;
    };

    sync();
    // A tablet that gains a mouse starts glowing without a reload.
    canHover.addEventListener("change", sync);
    return () => {
      canHover.removeEventListener("change", sync);
      detach?.();
    };
  }, []);

  return null;
}
