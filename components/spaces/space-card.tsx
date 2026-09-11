import Link from "next/link";
import { Globe, Lock, Star } from "lucide-react";
import {
  SPACE_KIND_BLURB,
  SPACE_KIND_ICON,
  SPACE_KIND_LABEL,
} from "@/lib/spaces/kinds";
import type { NavSpace } from "@/lib/spaces";
import { JoinButton } from "@/components/spaces/space-buttons";
import { cn } from "@/lib/utils";

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
    <article
      className={cn(
        "flex h-full flex-col rounded-card border bg-surface transition-colors",
        space.unread > 0 ? "border-brand/40" : "border-border",
        "hover:border-hairline-firm",
      )}
    >
      <Link
        href={`/spaces/${space.slug}`}
        className="flex flex-1 gap-2.5 p-3 no-underline"
      >
        <span
          className="grid size-10 shrink-0 place-items-center rounded-ctl bg-brand-wash text-brand-strong"
          aria-hidden
        >
          <KindIcon className="size-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate text-[14.5px] font-bold text-foreground">
              {space.name}
            </span>
            {space.unread > 0 ? (
              <span className="shrink-0 rounded-full bg-brand px-1.5 text-[10px] font-bold tabular-nums text-[#06120d]">
                {space.unread >= 50 ? "50+" : space.unread} new
              </span>
            ) : null}
            {space.favorite ? (
              <Star className="size-3 shrink-0 fill-current text-apricot" aria-hidden />
            ) : null}
          </span>

          <span className="mt-0.5 block line-clamp-2 text-[12.5px] leading-snug text-foreground-muted">
            {SPACE_KIND_BLURB[space.kind]}
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] font-semibold text-foreground-muted">
            <span className="inline-flex items-center gap-1">
              <KindIcon className="size-2.5" aria-hidden />
              {SPACE_KIND_LABEL[space.kind]}
            </span>
            <span className="inline-flex items-center gap-1">
              <VisibilityIcon className="size-2.5" aria-hidden />
              {space.visibility === "PRIVATE" ? "Private" : "Open"}
            </span>
            <span>
              {space.memberCount} {space.memberCount === 1 ? "member" : "members"}
            </span>
          </span>
        </span>
      </Link>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        {space.joined ? (
          <span className="text-[12.5px] font-bold text-brand">
            {space.favorite ? "Favourite" : "Joined"}
          </span>
        ) : space.visibility === "PRIVATE" ? (
          <span className="text-[12.5px] font-semibold text-foreground-muted">
            Invitation only
          </span>
        ) : (
          <JoinButton spaceId={space.id} slug={space.slug} size="sm" />
        )}
      </div>
    </article>
  );
}
