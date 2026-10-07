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
import { servableImageUrl } from "@/lib/media/servable-image";

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
  event: "Live class",
  post: "Post",
  member: "Member",
  space: "Room",
};

export function LinkCard({
  preview,
}: {
  preview: LinkPreview;
  /**
   * Whose bubble the card sits in. It used to borrow the own bubble's ink as
   * white-alpha literals, which were white on white once the fill went light
   * in dark mode. The card is a surface of its own now, painted from the same
   * tokens in both bubbles, so it reads on the brand fill and the muted one.
   */
  mine: boolean;
}) {
  const Icon = ICONS[preview.kind];
  return (
    <Link
      href={preview.href}
      className="mt-1.5 flex items-center gap-2.5 rounded-ctl border border-border bg-surface px-2.5 py-2 text-foreground no-underline shadow-e1 transition hover:border-hairline-firm hover:bg-surface-muted"
    >
      {preview.imageUrl ? (
        // Member and class images come from our own media host, not the
        // optimizer's allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={servableImageUrl(preview.imageUrl, 120)}
          alt=""
          className="size-9 shrink-0 rounded-chip bg-default object-cover"
        />
      ) : (
        <span
          className="grid size-9 shrink-0 place-items-center rounded-chip bg-brand-wash text-on-brand-wash"
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
          {LABELS[preview.kind]}
        </span>
        <span className="block truncate text-label font-semibold text-foreground">
          {preview.title}
        </span>
        {preview.detail ? (
          <span className="block truncate text-caption text-foreground-muted">
            {preview.detail}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
