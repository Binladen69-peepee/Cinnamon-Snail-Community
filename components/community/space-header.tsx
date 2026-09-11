import Link from "next/link";
import { Globe, Lock, Star, UserPlus, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  SPACE_KIND_ICON,
  SPACE_KIND_LABEL,
  SPACE_VISIBILITY_LABEL,
} from "@/lib/spaces/kinds";
import type { SpaceKind, SpaceVisibility } from "@/lib/spaces";
import {
  joinSpaceAction,
  leaveSpaceAction,
  toggleFavoriteSpaceAction,
} from "@/app/(member)/spaces/actions";
import { cn } from "@/lib/utils";

export type SpaceTab = { value: string; label: string; count?: number };

/**
 * The header of a space: what this room is, who runs it, and whether you are
 * in it.
 *
 * The old page opened with a bare `<h1>` and a "Create post" button, which told
 * a member nothing about where they had landed. A space is a place, so it gets
 * a cover, a host, its kind and its visibility stated plainly, and the two
 * actions that matter — join, and favourite.
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
    <header className="overflow-hidden rounded-card border border-border/70 bg-surface">
      {space.coverUrl ? (
        <div className="relative h-28 sm:h-36">
          {/* Space art is an arbitrary host, not an optimizer input. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={space.coverUrl}
            alt=""
            className="size-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(9,20,16,0.55)_100%)]" />
        </div>
      ) : null}

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
                {space.name}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-wash px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.09em] text-brand-strong">
                <KindIcon className="size-3" aria-hidden />
                {SPACE_KIND_LABEL[space.kind]}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-mint px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.09em] text-foreground-muted"
                title={SPACE_VISIBILITY_LABEL[space.visibility]}
              >
                <VisibilityIcon className="size-3" aria-hidden />
                {SPACE_VISIBILITY_LABEL[space.visibility]}
              </span>
            </div>

            {space.description ? (
              <p className="vu-measure mt-2 text-[14.5px] leading-relaxed text-foreground-muted">
                {space.description}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-foreground-muted">
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden />
                {space._count.memberships}{" "}
                {space._count.memberships === 1 ? "member" : "members"}
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
                    className="size-5 text-[9px]"
                  />
                  Hosted by {hostName}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {joined ? (
              <>
                <form action={toggleFavoriteSpaceAction}>
                  <input type="hidden" name="spaceId" value={space.id} />
                  <input type="hidden" name="slug" value={space.slug} />
                  <button
                    type="submit"
                    aria-pressed={isFavorite}
                    title={isFavorite ? "Remove from favourites" : "Add to favourites"}
                    className={cn(
                      "grid size-10 place-items-center rounded-full border transition",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                      isFavorite
                        ? "border-apricot/50 bg-apricot/15 text-apricot"
                        : "border-border text-foreground-muted hover:border-apricot/50 hover:text-apricot",
                    )}
                  >
                    <Star
                      className={cn("size-4", isFavorite && "fill-current")}
                      aria-hidden
                    />
                    <span className="sr-only">
                      {isFavorite ? "Favourited" : "Add to favourites"}
                    </span>
                  </button>
                </form>

                {/* A host cannot leave their own space, so they are not offered
                    a button that would fail. */}
                {isHost ? null : (
                  <form action={leaveSpaceAction}>
                    <input type="hidden" name="spaceId" value={space.id} />
                    <input type="hidden" name="slug" value={space.slug} />
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[13.5px] font-bold text-foreground-muted transition hover:border-danger/50 hover:text-danger"
                    >
                      Leave
                    </button>
                  </form>
                )}
              </>
            ) : canJoin ? (
              <form action={joinSpaceAction}>
                <input type="hidden" name="spaceId" value={space.id} />
                <input type="hidden" name="slug" value={space.slug} />
                <button
                  type="submit"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-forest px-4 text-[13.5px] font-bold text-paper transition hover:bg-deep-forest dark:bg-brand dark:text-[#06120d] dark:hover:bg-brand-strong"
                >
                  <UserPlus className="size-4" aria-hidden />
                  Join space
                </button>
              </form>
            ) : (
              <span className="inline-flex h-10 items-center rounded-full bg-mint px-4 text-[13px] font-semibold text-foreground-muted">
                Invitation only
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs. Which ones exist depends on the space's kind, so a chat room
          never shows an empty Courses tab. */}
      <nav
        aria-label={`${space.name} sections`}
        className="flex items-stretch gap-1 overflow-x-auto border-t border-border/60 px-2"
      >
        {tabs.map((tab) => {
          const active = tab.value === activeTab;
          return (
            <Link
              key={tab.value}
              href={`/spaces/${space.slug}${tab.value === "feed" ? "" : `?tab=${tab.value}`}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group/tab relative inline-flex shrink-0 items-center gap-1.5 px-3 pb-2.5 pt-2.5",
                "text-[13.5px] font-bold no-underline transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                active ? "text-brand" : "text-foreground-muted hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 ? (
                <span className="text-[12px] font-semibold tabular-nums opacity-70">
                  {tab.count}
                </span>
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-1.5 -bottom-px h-0.75 rounded-full transition-opacity",
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
