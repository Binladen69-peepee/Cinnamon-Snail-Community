import Link from "next/link";
import { Globe, Lock, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { MediaFrame } from "@/components/ui/media-frame";
import { TabBar, TabLink } from "@/components/app/ui";
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

export type SpaceTab = { value: string; label: string; count?: number };

/**
 * The header of a space.
 *
 * A space is a place, so it states plainly what kind of room it is, who can see
 * it, who runs it, and whether you are in it. Denser than a marketing banner —
 * the cover is a thin band rather than a hero, because you come here to read
 * the room, not to admire it.
 *
 * It sits on the page ground rather than in a card of its own, so the first
 * post is the first box on the page. The member's own controls (`tools`) ride
 * in the header, above the tabs, instead of in another card between the tabs
 * and the feed.
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
  tools,
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
  /** The viewer's controls for this room: notifications, review, settings. */
  tools?: React.ReactNode;
}) {
  const KindIcon = SPACE_KIND_ICON[space.kind];
  const VisibilityIcon = space.visibility === "PRIVATE" ? Lock : Globe;
  const hostName = space.host?.profile?.displayName ?? space.host?.handle;

  return (
    <header className="flex flex-col gap-4">
      {space.coverUrl ? (
        <MediaFrame
          src={space.coverUrl}
          alt=""
          aspect="h-24 sm:h-32"
          rounded="rounded-card"
          className="bg-surface-muted"
        />
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid size-12 shrink-0 place-items-center rounded-card bg-brand-wash text-on-brand-wash"
            aria-hidden
          >
            <KindIcon className="size-5" />
          </span>

          <div className="min-w-0">
            <h1 className="text-display font-semibold tracking-[-0.02em] text-foreground text-balance">
              {space.name}
            </h1>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-foreground-muted">
              <span className="inline-flex items-center gap-1">
                <KindIcon className="size-3.5" aria-hidden />
                {SPACE_KIND_LABEL[space.kind]}
              </span>
              <span
                className="inline-flex items-center gap-1"
                title={SPACE_VISIBILITY_LABEL[space.visibility]}
              >
                <VisibilityIcon className="size-3.5" aria-hidden />
                {SPACE_VISIBILITY_LABEL[space.visibility]}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Users className="size-3.5" aria-hidden />
                {space._count.memberships}
              </span>
              <span className="tabular-nums">{space._count.posts} posts</span>
              {space.host ? (
                <Link
                  href={`/members/${space.host.handle}`}
                  className="inline-flex items-center gap-1.5 text-foreground-muted no-underline transition hover:text-foreground"
                >
                  <Avatar
                    name={hostName ?? "Host"}
                    src={space.host.profile?.avatarUrl}
                    size="xs"
                    className="size-5"
                  />
                  {hostName}
                </Link>
              ) : null}
            </div>
          </div>
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
                <span className="inline-flex h-9 items-center rounded-ctl bg-brand-wash px-3.5 text-label font-medium text-on-brand-wash">
                  Host
                </span>
              ) : (
                <LeaveButton spaceId={space.id} slug={space.slug} />
              )}
            </>
          ) : canJoin ? (
            <JoinButton spaceId={space.id} slug={space.slug} />
          ) : (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-ctl bg-default px-3.5 text-label font-medium text-foreground-muted">
              <Lock className="size-4" aria-hidden />
              Invitation only
            </span>
          )}
        </div>
      </div>

      {space.description ? (
        <p className="max-w-prose text-body text-foreground-muted text-pretty">
          {space.description}
        </p>
      ) : null}

      {tools}

      <TabBar label={`${space.name} sections`}>
        {tabs.map((tab) => (
          <TabLink
            key={tab.value}
            href={`/spaces/${space.slug}${tab.value === "feed" ? "" : `?tab=${tab.value}`}`}
            active={tab.value === activeTab}
            scroll
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 ? (
              <span className="text-caption font-normal tabular-nums text-foreground-muted">
                {tab.count}
              </span>
            ) : null}
          </TabLink>
        ))}
      </TabBar>
    </header>
  );
}
