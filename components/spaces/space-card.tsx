import Link from "next/link";
import { Check, Globe, Lock, Star, Users } from "lucide-react";
import {
  SPACE_KIND_BLURB,
  SPACE_KIND_ICON,
  SPACE_KIND_LABEL,
} from "@/lib/spaces/kinds";
import type { NavSpace } from "@/lib/spaces";
import { JoinButton } from "@/components/spaces/space-buttons";
import { Badge, Card } from "@/components/app/ui";

/**
 * A space in the directory.
 *
 * Every card is the same object: a fixed 40px icon tile rather than a cover
 * image, so a room with art and a room without are the same height and a grid
 * of them has no holes. The previous build used covers and a cover-less card
 * rendered a third as tall as its neighbour.
 *
 * Join sits outside the link, so tapping the card opens the room and tapping
 * the button joins it.
 */
export function SpaceCard({ space }: { space: NavSpace }) {
  const KindIcon = SPACE_KIND_ICON[space.kind];
  const VisibilityIcon = space.visibility === "PRIVATE" ? Lock : Globe;

  return (
    <Card as="article" padding="none" interactive className="flex h-full flex-col">
      <Link
        href={`/spaces/${space.slug}`}
        className="flex flex-1 gap-3 p-4 no-underline"
      >
        <span
          className="grid size-10 shrink-0 place-items-center rounded-ctl bg-brand-wash text-on-brand-wash"
          aria-hidden
        >
          <KindIcon className="size-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-title font-semibold text-foreground">
              {space.name}
            </span>
            {space.favorite ? (
              <Star className="size-3.5 shrink-0 fill-current text-brand" aria-hidden />
            ) : null}
            {space.unread > 0 ? (
              <Badge tone="highlight" className="tabular-nums">
                {space.unread >= 50 ? "50+" : space.unread} new
              </Badge>
            ) : null}
          </span>

          <span className="mt-1 block line-clamp-2 text-label text-foreground-muted">
            {SPACE_KIND_BLURB[space.kind]}
          </span>

          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-foreground-muted">
            <span className="inline-flex items-center gap-1">
              <KindIcon className="size-3" aria-hidden />
              {SPACE_KIND_LABEL[space.kind]}
            </span>
            <span className="inline-flex items-center gap-1">
              <VisibilityIcon className="size-3" aria-hidden />
              {space.visibility === "PRIVATE" ? "Private" : "Open"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" aria-hidden />
              {space.memberCount} {space.memberCount === 1 ? "member" : "members"}
            </span>
          </span>
        </span>
      </Link>

      <div className="mt-auto flex min-h-12 items-center justify-between gap-2 border-t border-separator px-4 py-2">
        {space.joined ? (
          <span className="inline-flex items-center gap-1.5 text-label font-medium text-brand-strong">
            <Check className="size-3.5" aria-hidden />
            {space.favorite ? "Favourite" : "Joined"}
          </span>
        ) : space.visibility === "PRIVATE" ? (
          <span className="inline-flex items-center gap-1.5 text-label text-foreground-muted">
            <Lock className="size-3.5" aria-hidden />
            Invitation only
          </span>
        ) : (
          <JoinButton spaceId={space.id} slug={space.slug} size="sm" />
        )}
      </div>
    </Card>
  );
}
