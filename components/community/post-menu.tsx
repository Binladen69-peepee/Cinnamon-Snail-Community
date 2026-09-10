"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Ellipsis, Flag, Pin, PinOff } from "lucide-react";
import { pinAction, reportAction } from "@/app/(member)/community-actions";

/**
 * Post overflow menu.
 *
 * Replaces a bare <details> element, which could not be dismissed with Escape
 * or by clicking away and left the panel hanging open while navigating. Saving
 * lives in the action bar, so it is not duplicated here.
 */
export function PostMenu({
  postId,
  pinned,
  canPin,
}: {
  postId: string;
  pinned: boolean;
  canPin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClick);
    };
  }, [open]);

  function run(action: (data: FormData) => Promise<void>, extra?: Record<string, string>) {
    const data = new FormData();
    data.set("postId", postId);
    for (const [key, value] of Object.entries(extra ?? {})) data.set(key, value);
    setOpen(false);
    startTransition(async () => {
      await action(data);
    });
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Post actions"
        className="grid size-9 place-items-center rounded-full text-foreground-muted transition hover:bg-mint hover:text-forest"
      >
        <Ellipsis className="size-4" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-30 w-44 overflow-hidden rounded-2xl border border-sand bg-surface py-1.5 shadow-[0_16px_40px_rgba(15,61,50,0.16)]"
        >
          {canPin ? (
            <MenuItem
              onClick={() => run(pinAction)}
              icon={
                pinned ? (
                  <PinOff className="size-4" aria-hidden />
                ) : (
                  <Pin className="size-4" aria-hidden />
                )
              }
              label={pinned ? "Unpin from space" : "Pin to space"}
            />
          ) : null}
          <MenuItem
            onClick={() => run(reportAction, { reason: "needs_review" })}
            icon={<Flag className="size-4" aria-hidden />}
            label="Report post"
            tone="danger"
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  label,
  tone = "default",
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium transition hover:bg-mint ${
        tone === "danger" ? "text-danger hover:text-danger" : "text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
