"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Compass,
  FileText,
  Handshake,
  Hash,
  Leaf,
  Lock,
  Map,
  MessageSquare,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { CountBadge } from "@/components/app/ui";
import { SPACE_KIND_ICON } from "@/lib/spaces/kinds";
import type { NavSpace, SpaceGroupWithSpaces } from "@/lib/spaces";
import { cn } from "@/lib/utils";

type Dest = { href: string; label: string; icon: LucideIcon };

const PRIMARY: Dest[] = [
  { href: "/home", label: "Explorer", icon: Compass },
];

const SECTIONS: { label: string; links: Dest[] }[] = [
  {
    label: "Community",
    links: [
      { href: "/spaces", label: "Spaces", icon: Users },
      { href: "/members", label: "Members", icon: UserRound },
      { href: "/connect", label: "Connect", icon: Handshake },
      { href: "/messages", label: "Messages", icon: MessageSquare },
      { href: "/drafts", label: "Drafts", icon: FileText },
    ],
  },
  {
    label: "Learning",
    links: [
      { href: "/learn", label: "Courses", icon: BookOpen },
      { href: "/calendar", label: "Events", icon: CalendarDays },
      { href: "/roadmap", label: "Roadmap", icon: Map },
    ],
  },
  {
    label: "Local",
    links: [{ href: "/bulletin", label: "Bulletin board", icon: ClipboardList }],
  },
];

/**
 * Fixed left destinations. Quiet group labels, soft active pill, unread
 * badges. Spaces keep a # prefix so rooms read like channels.
 * See PROJECT.md — the member shell and feed layout.
 */
export function SideRail({
  favorites,
  groups,
  unread,
}: {
  favorites: NavSpace[];
  groups: SpaceGroupWithSpaces[];
  unread: Record<string, number>;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem("vu-rail-groups");
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  function toggle(key: string) {
    setCollapsed((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        sessionStorage.setItem("vu-rail-groups", JSON.stringify(next));
      } catch {
        // Private mode; remembering is optional.
      }
      return next;
    });
  }

  const active = (href: string) =>
    href === "/home"
      ? pathname === "/home"
      : pathname === href || pathname.startsWith(`${href}/`);

  const favoriteIds = new Set(favorites.map((space) => space.id));
  const spaceGroups: { id: string | null; name: string; spaces: NavSpace[] }[] =
    favorites.length > 0
      ? [
          { id: "favorites", name: "Spaces", spaces: favorites },
          ...groups
            .map((group) => ({
              id: group.id,
              name: group.name,
              spaces: group.spaces.filter((space) => !favoriteIds.has(space.id)),
            }))
            .filter((group) => group.spaces.length > 0),
        ]
      : groups.map((group) => ({
          id: group.id,
          name: group.name,
          spaces: group.spaces,
        }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The lockup lives in the rail rather than the bar above it, so the
          panel reads as the product's own edge instead of as a list tucked
          under a header. It keeps the bar's height, which is what lines the
          two up across the fold. */}
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
        <BrandMark href="/home" className="min-w-0" />
      </div>

      <nav
        aria-label="Main"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4"
      >
        <ul className="flex flex-col gap-px">
          {PRIMARY.map((link) => (
            <Row
              key={link.href}
              href={link.href}
              label={link.label}
              icon={link.icon}
              active={active(link.href)}
              count={unread[link.href] ?? 0}
            />
          ))}
        </ul>

        {SECTIONS.map((section) => (
          <div key={section.label} className="flex flex-col gap-1">
            <p className="px-2.5 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
              {section.label}
            </p>
            <ul className="flex flex-col gap-px">
              {section.links.map((link) => (
                <Row
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  icon={link.icon}
                  active={active(link.href)}
                  count={unread[link.href] ?? 0}
                />
              ))}
            </ul>
          </div>
        ))}

        {spaceGroups.map((group, index) => {
          const key = group.id ?? "ungrouped";
          const heading = index === 0 ? "Spaces" : group.name;
          const isCollapsed = collapsed[key] ?? false;
          const groupUnread = group.spaces.reduce((sum, space) => sum + space.unread, 0);
          const collapsible = spaceGroups.length > 1 && key !== "favorites";

          return (
            <div key={key} className="flex flex-col gap-1">
              {collapsible ? (
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-1 rounded-ctl px-2.5 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted transition hover:text-sidebar-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "size-3 shrink-0 transition-transform",
                      isCollapsed && "-rotate-90",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{heading}</span>
                  {isCollapsed && groupUnread > 0 ? (
                    <CountBadge count={groupUnread} className="ml-auto" />
                  ) : null}
                </button>
              ) : (
                <p className="px-2.5 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                  {heading}
                </p>
              )}
              {!isCollapsed ? (
                <ul className="flex flex-col gap-px">
                  {group.spaces.map((space) => (
                    <SpaceRow key={space.id} space={space} pathname={pathname} />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border px-5 py-4">
        <p className="flex items-center gap-2 text-caption text-foreground-muted">
          <Leaf className="size-3.5 shrink-0 text-brand" aria-hidden />
          Better food. Kinder planet.
        </p>
      </div>
    </div>
  );
}

function Row({
  href,
  label,
  icon: Icon,
  active,
  count,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  count: number;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-9 items-center gap-2.5 rounded-ctl px-2.5 text-label font-medium no-underline transition",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-foreground-muted hover:bg-surface-muted hover:text-sidebar-foreground",
        )}
      >
        <Icon className="size-[1.125rem] shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <CountBadge count={count} label={`${count} unread`} />
      </Link>
    </li>
  );
}

function SpaceRow({ space, pathname }: { space: NavSpace; pathname: string }) {
  const href = `/spaces/${space.slug}`;
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const Icon = SPACE_KIND_ICON[space.kind] ?? Hash;
  const hashLabel =
    space.kind === "FEED" || space.kind === "CHAT" ? `# ${space.name}` : space.name;

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-ctl px-2.5 text-label no-underline transition",
          active
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : space.unread > 0
              ? "font-medium text-sidebar-foreground hover:bg-surface-muted"
              : "text-foreground-muted hover:bg-surface-muted hover:text-sidebar-foreground",
        )}
      >
        {/* A space can carry its own emoji. It was stored and loaded and then
            never drawn, so every room looked like its kind rather than like
            itself. */}
        {space.icon ? (
          <span className="grid size-3.5 shrink-0 place-items-center text-[13px] leading-none" aria-hidden>
            {space.icon}
          </span>
        ) : (
          <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate">{hashLabel}</span>
        {/* Listed, but closed until they hold the product it is sold with. */}
        {space.locked ? (
          <Lock className="size-3 shrink-0 opacity-60" aria-hidden />
        ) : null}
        <CountBadge count={space.unread} label={`${space.unread} unread`} />
      </Link>
    </li>
  );
}
