"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Ellipsis, Flag, Pin, PinOff, Share2, Trash2 } from "lucide-react";
import { pinPostAction } from "@/app/(member)/community-actions";
import { runAction, type ActionResult } from "@/components/feed/run-action";

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
  canDelete = false,
  canShare = false,
  onReport,
  onShare,
  onDelete,
}: {
  postId: string;
  pinned: boolean;
  canPin: boolean;
  canDelete?: boolean;
  canShare?: boolean;
  /** Opened as dialogs by the card, so the menu stays a menu. */
  onReport?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
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

  function run(
    action: (data: FormData) => Promise<ActionResult>,
    extra?: Record<string, string>,
  ) {
    const data = new FormData();
    data.set("postId", postId);
    for (const [key, value] of Object.entries(extra ?? {})) data.set(key, value);
    setOpen(false);
    startTransition(async () => {
      await runAction(action, data);
    });
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Post actions"
        className="grid size-9 place-items-center rounded-full text-foreground-muted transition hover:bg-surface-muted hover:text-foreground"
      >
        <Ellipsis className="size-4" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-30 w-44 overflow-hidden rounded-card border border-border bg-surface py-1.5 shadow-e2"
        >
          {canPin ? (
            <MenuItem
              onClick={() => run(pinPostAction)}
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
          {canShare ? (
            <MenuItem
              onClick={() => {
                setOpen(false);
                onShare?.();
              }}
              icon={<Share2 className="size-4" aria-hidden />}
              label="Share to a space"
            />
          ) : null}
          {canDelete ? (
            <MenuItem
              onClick={() => {
                setOpen(false);
                onDelete?.();
              }}
              icon={<Trash2 className="size-4" aria-hidden />}
              label="Delete post"
              tone="danger"
            />
          ) : null}
          <MenuItem
            onClick={() => {
              setOpen(false);
              onReport?.();
            }}
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
