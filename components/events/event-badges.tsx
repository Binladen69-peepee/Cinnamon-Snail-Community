import { Radio, Video } from "lucide-react";
import type { EventStatus } from "@prisma/client";
import { Badge } from "@/components/app/ui";

/**
 * An event's status, as badges: live, canceled, draft, and whether a
 * recording is attached.
 *
 * Shared by the list card and the event page, which had drifted to two sizes
 * of the same chips. "Live now" used to be white on the danger red, which in
 * dark mode measured under 3:1. It is now the terracotta highlight with a
 * signal icon: the one thing on the screen meant to be noticed, and the word
 * still says it, so colour is never the only carrier.
 */
export function EventBadges({
  live,
  status,
  hasRecording = false,
  draftLabel = "Draft",
}: {
  live: boolean;
  status: EventStatus;
  hasRecording?: boolean;
  /** The event page spells out who can see a draft; the card does not. */
  draftLabel?: string;
}) {
  if (!live && status === "PUBLISHED" && !hasRecording) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {live ? (
        <Badge tone="highlight" icon={<Radio aria-hidden />}>
          Live now
        </Badge>
      ) : null}
      {status === "CANCELED" ? <Badge tone="danger">Canceled</Badge> : null}
      {status === "DRAFT" ? <Badge tone="neutral">{draftLabel}</Badge> : null}
      {hasRecording ? (
        <Badge tone="outline" icon={<Video aria-hidden />}>
          Recording
        </Badge>
      ) : null}
    </div>
  );
}
