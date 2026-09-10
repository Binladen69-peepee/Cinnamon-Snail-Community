"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Cursor-following highlight on a card. Writes pointer position into CSS
 * variables and lets `.vu-spotlight` in globals.css do the painting, so no
 * React state updates on mousemove.
 */
export function Spotlight({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(event: React.PointerEvent<HTMLDivElement>) {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      className={cn("vu-spotlight", className)}
    >
      {children}
    </div>
  );
}

/** Thin accent bar showing how far down the page the visitor has scrolled. */
export function ScrollProgress() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-accent vu-scroll-progress"
    />
  );
}
