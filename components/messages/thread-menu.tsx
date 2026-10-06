"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Ban, LogOut, MoreHorizontal, UserRound, Users } from "lucide-react";
import {
  blockMemberAction,
  leaveConversationAction,
} from "@/app/(member)/messages/actions";
import type { ThreadCrew, ThreadOther } from "@/components/messages/thread";
import { Avatar } from "@/components/ui/avatar";
import { Button, menuClass, menuItemClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * Block, unblock, leave, and a way to the people in the thread.
 *
 * A real button with a dismissable panel rather than a `<details>` element,
 * which cannot be closed with Escape — the same reason `PostMenu` was rewritten.
 * Blocking and leaving are both destructive enough to confirm first.
 *
 * A small group lists who is in it. A crew chat points to the crew's page,
 * where its members are, and leaving it leaves the chat, not the crew.
 */
export function ThreadMenu({
  conversationId,
  isGroup,
  crew = null,
  others,
}: {
  conversationId: string;
  isGroup: boolean;
  crew?: ThreadCrew | null;
  others: ThreadOther[];
}) {
  const [open, setOpen] = useState(false);
  // A refused block comes back as a message rather than a throw; it is shown
  // in the menu it came from instead of the menu closing as if it had worked.
  const [error, setError] = useState<string | null>(null);
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

  const single = !crew && others.length === 1 ? others[0] : null;
  const people = !crew && isGroup ? others : [];

  function toggleBlock(handle: string, name: string, blocked: boolean) {
    const message = blocked
      ? `Unblock ${name}? They will be able to message you again.`
      : `Block ${name}? They will not be able to message you, and you will not see their messages.`;
    if (!window.confirm(message)) return;
    const data = new FormData();
    data.set("handle", handle);
    if (blocked) data.set("unblock", "1");
    startTransition(async () => {
      const result = await blockMemberAction(data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setOpen(false);
    });
  }

  function leave() {
    const question = crew
      ? `Leave the ${crew.name} chat? You stay in the crew, and can come back any time from the crew's page.`
      : "Leave this conversation? It disappears from your inbox and you stop receiving its messages.";
    if (!window.confirm(question)) return;
    const data = new FormData();
    data.set("conversationId", conversationId);
    startTransition(async () => {
      await leaveConversationAction(data);
    });
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        onClick={() => {
          setError(null);
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Conversation options"
      >
        <MoreHorizontal className="size-[1.125rem]" aria-hidden />
      </Button>

      {open ? (
        <div role="menu" className={cn(menuClass, "absolute right-0 top-10 z-30 w-64")}>
          {crew ? (
            <Link href={`/crews/${crew.slug}`} role="menuitem" className={menuItemClass}>
              <Users aria-hidden />
              View crew and members
            </Link>
          ) : null}

          {people.length > 0 ? (
            <div className="mb-1 border-b border-separator pb-1">
              <p className="px-2.5 pb-1 pt-1.5 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                In this group
              </p>
              {people.map((person) => (
                <Link
                  key={person.id}
                  href={`/members/${person.handle}`}
                  role="menuitem"
                  className={menuItemClass}
                >
                  <Avatar name={person.name} src={person.avatarUrl} size="xs" />
                  <span className="min-w-0 truncate">{person.name}</span>
                </Link>
              ))}
            </div>
          ) : null}

          {single ? (
            <Link
              href={`/members/${single.handle}`}
              role="menuitem"
              className={menuItemClass}
            >
              <UserRound aria-hidden />
              View profile
            </Link>
          ) : null}

          {single ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => toggleBlock(single.handle, single.name, single.blockedByViewer)}
              className={menuItemClass}
            >
              <Ban aria-hidden />
              {single.blockedByViewer ? "Unblock" : "Block"} {single.name}
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            onClick={leave}
            className={cn(
              menuItemClass,
              "text-danger hover:bg-danger-wash [&_svg]:text-danger",
            )}
          >
            <LogOut aria-hidden />
            {crew ? "Leave crew chat" : `Leave ${isGroup ? "group" : "conversation"}`}
          </button>

          {error ? (
            <p
              role="alert"
              className="mx-1 mb-1 mt-1.5 rounded-chip bg-danger-wash px-2.5 py-2 text-caption font-medium text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
