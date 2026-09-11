import Link from "next/link";
import { Globe, Lock, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  SPACE_KIND_ICON,
  SPACE_KIND_LABEL,
  SPACE_VISIBILITY_LABEL,
} from "@/lib/spaces/kinds";
import type { SpaceKind, SpaceVisibility } from "@/lib/spaces";
import {
  FavoriteButton,
  JoinButton,
  LeaveButton,
} from "@/components/spaces/space-buttons";
import { cn } from "@/lib/utils";

export type SpaceTab = { value: string; label: string; count?: number };

/**
 * The header of a space.
 *
 * A space is a place, so it states plainly what kind of room it is, who can see
 * it, who runs it, and whether you are in it. Denser than a marketing banner —
 * the cover is a thin band rather than a hero, because you come here to read
 * the room, not to admire it.
 *
 * Tabs come from the kind, so a chat room never presents an empty Lessons tab.
 */
export function SpaceHeader({
  space,
  tabs,
  activeTab,
  joined,
  canJoin,
  isFavorite,
  isHost,
}: {
  space: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    coverUrl: string | null;
    kind: SpaceKind;
    visibility: SpaceVisibility;
    host: {
      handle: string;
      profile: { displayName: string; avatarUrl: string | null } | null;
    } | null;
    _count: { memberships: number; posts: number };
  };
  tabs: SpaceTab[];
  activeTab: string;
  joined: boolean;
  canJoin: boolean;
  isFavorite: boolean;
  isHost: boolean;
}) {
  const KindIcon = SPACE_KIND_ICON[space.kind];
  const VisibilityIcon = space.visibility === "PRIVATE" ? Lock : Globe;
  const hostName = space.host?.profile?.displayName ?? space.host?.handle;

  return (
    <header className="overflow-hidden rounded-card border border-border bg-surface">
      {space.coverUrl ? (
        <div className="relative h-20 sm:h-24">
          {/* Space art is an arbitrary host, not an optimizer input. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={space.coverUrl} alt="" className="size-full object-cover" />
        </div>
      ) : null}

      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-ctl bg-brand-wash text-brand-strong"
            aria-hidden
          >
            <KindIcon className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[1.35rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
              {space.name}
            </h1>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-foreground-muted">
              <span className="inline-flex items-center gap-1 font-semibold">
                <KindIcon className="size-3" aria-hidden />
                {SPACE_KIND_LABEL[space.kind]}
              </span>
              <span
                className="inline-flex items-center gap-1 font-semibold"
                title={SPACE_VISIBILITY_LABEL[space.visibility]}
              >
                <VisibilityIcon className="size-3" aria-hidden />
                {SPACE_VISIBILITY_LABEL[space.visibility]}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" aria-hidden />
                {space._count.memberships}
              </span>
              <span>{space._count.posts} posts</span>
              {space.host ? (
                <Link
                  href={`/members/${space.host.handle}`}
                  className="inline-flex items-center gap-1.5 no-underline hover:text-brand"
                >
                  <Avatar
                    name={hostName ?? "Host"}
                    src={space.host.profile?.avatarUrl}
                    size="sm"
                    className="size-4 text-[8px]"
                  />
                  {hostName}
                </Link>
              ) : null}
            </div>

            {space.description ? (
              <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-foreground-muted">
                {space.description}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-start gap-2">
            {joined ? (
              <>
                <FavoriteButton
                  spaceId={space.id}
                  slug={space.slug}
                  favorite={isFavorite}
                />
                {/* A host cannot leave their own space, so they are not shown a
                    button that would only refuse. */}
                {isHost ? (
                  <span className="inline-flex h-9 items-center rounded-full bg-brand-wash px-3 text-[12.5px] font-bold text-brand-strong">
                    Host
                  </span>
                ) : (
                  <LeaveButton spaceId={space.id} slug={space.slug} />
                )}
              </>
            ) : canJoin ? (
              <JoinButton spaceId={space.id} slug={space.slug} />
            ) : (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mint px-3 text-[12.5px] font-semibold text-foreground-muted">
                <Lock className="size-3.5" aria-hidden />
                Invitation only
              </span>
            )}
          </div>
        </div>
      </div>

      <nav
        aria-label={`${space.name} sections`}
        className="flex items-stretch gap-0.5 overflow-x-auto border-t border-border px-1.5"
      >
        {tabs.map((tab) => {
          const active = tab.value === activeTab;
          return (
            <Link
              key={tab.value}
              href={`/spaces/${space.slug}${tab.value === "feed" ? "" : `?tab=${tab.value}`}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group/tab relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5",
                "text-[13px] font-bold no-underline transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
                active ? "text-brand" : "text-foreground-muted hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 ? (
                <span className="text-[11.5px] font-semibold tabular-nums opacity-70">
                  {tab.count}
                </span>
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-1.5 bottom-0 h-0.5 rounded-full transition-opacity",
                  active
                    ? "bg-brand opacity-100"
                    : "bg-foreground/25 opacity-0 group-hover/tab:opacity-100",
                )}
              />
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
