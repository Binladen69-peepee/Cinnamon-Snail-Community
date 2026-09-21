"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Ban, LogOut, MoreHorizontal, UserRound } from "lucide-react";
import {
  blockMemberAction,
  leaveConversationAction,
} from "@/app/(member)/messages/actions";
import type { ThreadOther } from "@/components/messages/thread";

/**
 * Block, unblock, leave, and a way to the other person's profile.
 *
 * A real button with a dismissable panel rather than a `<details>` element,
 * which cannot be closed with Escape — the same reason `PostMenu` was rewritten.
 * Blocking and leaving are both destructive enough to confirm first.
 */
export function ThreadMenu({
  conversationId,
  isGroup,
  others,
}: {
  conversationId: string;
  isGroup: boolean;
  others: ThreadOther[];
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const single = others.length === 1 ? others[0] : null;

  function toggleBlock(handle: string, name: string, blocked: boolean) {
    const message = blocked
      ? `Unblock ${name}? They will be able to message you again.`
      : `Block ${name}? They will not be able to message you, and you will not see their messages.`;
    if (!window.confirm(message)) return;
    const data = new FormData();
    data.set("handle", handle);
    if (blocked) data.set("unblock", "1");
    startTransition(async () => {
      await blockMemberAction(data);
      setOpen(false);
    });
  }

  function leave() {
    if (
      !window.confirm(
        "Leave this conversation? It disappears from your inbox and you stop receiving its messages.",
      )
    ) {
      return;
    }
    const data = new FormData();
    data.set("conversationId", conversationId);
    startTransition(async () => {
      await leaveConversationAction(data);
    });
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Conversation options"
        className="grid size-8 place-items-center rounded-full text-foreground-muted transition hover:bg-brand-wash hover:text-brand-strong"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-60 overflow-hidden rounded-card border border-border bg-overlay py-1 shadow-e3"
        >
          {single ? (
            <Link
              href={`/members/${single.handle}`}
              role="menuitem"
              className="flex items-center gap-2 px-3 py-2 text-[13.5px] text-foreground no-underline transition hover:bg-brand-wash"
            >
              <UserRound className="size-4" aria-hidden />
              View profile
            </Link>
          ) : null}

          {single ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => toggleBlock(single.handle, single.name, single.blockedByViewer)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] text-foreground transition hover:bg-brand-wash"
            >
              <Ban className="size-4" aria-hidden />
              {single.blockedByViewer ? "Unblock" : "Block"} {single.name}
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            onClick={leave}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] text-danger transition hover:bg-brand-wash"
          >
            <LogOut className="size-4" aria-hidden />
            Leave {isGroup ? "group" : "conversation"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
