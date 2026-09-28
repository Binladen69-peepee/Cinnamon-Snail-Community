"use client";

import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  Hash,
  MessageSquare,
  PlayCircle,
  UserRound,
} from "lucide-react";
import type { LinkPreview } from "@/lib/messages/link-preview";
import { cn } from "@/lib/utils";

/**
 * A link to something inside the community, unfurled.
 *
 * Only internal links get a card — see `lib/messages/link-preview.ts` for why
 * fetching an arbitrary URL from the server is not worth the attack surface.
 * These are also the links members actually paste to each other here: a
 * lesson, a class, a live session, somebody's profile.
 *
 * It is a link to the thing, not a copy of it. Nothing here is content the
 * reader could not already reach.
 */

const ICONS: Record<LinkPreview["kind"], typeof BookOpen> = {
  lesson: PlayCircle,
  class: BookOpen,
  event: CalendarDays,
  post: MessageSquare,
  member: UserRound,
  space: Hash,
};

const LABELS: Record<LinkPreview["kind"], string> = {
  lesson: "Lesson",
  class: "Class",
  event: "Event",
  post: "Post",
  member: "Member",
  space: "Room",
};

export function LinkCard({
  preview,
  mine,
}: {
  preview: LinkPreview;
  /** Own bubbles are on the brand fill, so the card borrows its ink. */
  mine: boolean;
}) {
  const Icon = ICONS[preview.kind];
  return (
    <Link
      href={preview.href}
      className={cn(
        "mt-1.5 flex items-center gap-2.5 rounded-ctl border px-2.5 py-2 no-underline transition",
        mine
          ? "border-white/25 bg-white/10 hover:bg-white/15"
          : "border-border bg-background hover:border-hairline-firm",
      )}
    >
      {preview.imageUrl ? (
        // Member and class images come from our own media host, not the
        // optimizer's allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.imageUrl}
          alt=""
          className="size-9 shrink-0 rounded-ctl object-cover"
        />
      ) : (
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-ctl",
            mine ? "bg-white/15" : "bg-brand-wash text-on-brand-wash",
          )}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[10px] font-bold uppercase tracking-[0.12em]",
            mine ? "text-white/60" : "text-foreground-muted",
          )}
        >
          {LABELS[preview.kind]}
        </span>
        <span
          className={cn(
            "block truncate text-[13px] font-semibold",
            mine ? "text-white" : "text-foreground",
          )}
        >
          {preview.title}
        </span>
        {preview.detail ? (
          <span
            className={cn(
              "block truncate text-[11.5px]",
              mine ? "text-white/70" : "text-foreground-muted",
            )}
          >
            {preview.detail}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
