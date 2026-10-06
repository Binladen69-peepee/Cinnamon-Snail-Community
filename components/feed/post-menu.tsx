"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Ellipsis, Flag, Megaphone, MegaphoneOff, Trash2 } from "lucide-react";
import { pinPostAction } from "@/app/(member)/community-actions";
import { runAction, type ActionResult } from "@/components/feed/run-action";
import { menuClass, menuItemClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * Post overflow menu.
 *
 * Replaces a bare <details> element, which could not be dismissed with Escape
 * or by clicking away. Pinning lives in the action bar, so it is not
 * duplicated here, and there is no sharing: posts are not re-shared any more
 * (DEC-078).
 *
 * The team's own pin is called an announcement here, so it is never confused
 * with a member's "Pin this post", which only moves a post in their own feed.
 */
export function PostMenu({
  postId,
  pinned,
  canPin,
  canDelete = false,
  canReport = true,
  onReport,
  onDelete,
}: {
  postId: string;
  /** Whether it is an announcement (`Post.pinnedAt`). */
  pinned: boolean;
  /** Whether this reader may make announcements (hosts and staff). */
  canPin: boolean;
  canDelete?: boolean;
  canReport?: boolean;
  /** Opened as dialogs by the card, so the menu stays a menu. */
  onReport?: () => void;
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

  function run(action: (data: FormData) => Promise<ActionResult>) {
    const data = new FormData();
    data.set("postId", postId);
    setOpen(false);
    startTransition(async () => {
      await runAction(action, data);
    });
  }

  // Nothing to offer: no empty menu behind a button.
  if (!canPin && !canDelete && !canReport) return null;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Post actions"
        className={cn(
          "grid size-9 place-items-center rounded-ctl text-foreground-muted transition hover:bg-surface-muted hover:text-foreground",
          open && "bg-surface-muted text-foreground",
        )}
      >
        <Ellipsis className="size-4.5" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Post actions"
          className={cn(menuClass, "absolute right-0 top-[calc(100%+0.25rem)] z-30 w-56")}
        >
          {canPin ? (
            <MenuItem
              onClick={() => run(pinPostAction)}
              icon={
                pinned ? (
                  <MegaphoneOff className="size-4" aria-hidden />
                ) : (
                  <Megaphone className="size-4" aria-hidden />
                )
              }
              label={pinned ? "Remove announcement" : "Make an announcement"}
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
          {canReport ? (
            <MenuItem
              onClick={() => {
                setOpen(false);
                onReport?.();
              }}
              icon={<Flag className="size-4" aria-hidden />}
              label="Report post"
              tone="danger"
            />
          ) : null}
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
      className={cn(menuItemClass, tone === "danger" && "text-danger [&_svg]:text-danger")}
    >
      {icon}
      {label}
    </button>
  );
}
