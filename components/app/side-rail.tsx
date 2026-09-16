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
  Hash,
  Home,
  Leaf,
  Map,
  MessageSquare,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { LeafCluster } from "@/components/marketing/hero-decor";
import { SPACE_KIND_ICON } from "@/lib/spaces/kinds";
import type { NavSpace, SpaceGroupWithSpaces } from "@/lib/spaces";
import { cn } from "@/lib/utils";

type Dest = { href: string; label: string; icon: LucideIcon };

const PRIMARY: Dest[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
];

const SECTIONS: { label: string; links: Dest[] }[] = [
  {
    label: "Community",
    links: [
      { href: "/spaces", label: "Spaces", icon: Users },
      { href: "/members", label: "Members", icon: UserRound },
      { href: "/messages", label: "Messages", icon: MessageSquare },
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
 * docs/feed-home-redesign.md · Step 2
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
      <nav
        aria-label="Main"
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-4"
      >
        <ul className="flex flex-col gap-0.5">
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
          <div key={section.label} className="flex flex-col gap-1.5">
            <p className="px-2.5 text-[10.5px] uppercase tracking-[0.16em] text-sidebar-foreground/40">
              {section.label}
            </p>
            <ul className="flex flex-col gap-0.5">
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
            <div key={key} className="flex flex-col gap-1.5">
              {collapsible ? (
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-1 px-2.5 text-[10.5px] uppercase tracking-[0.16em] text-sidebar-foreground/40 transition hover:text-sidebar-foreground"
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
                    <Badge count={groupUnread} className="ml-auto" />
                  ) : null}
                </button>
              ) : (
                <p className="px-2.5 text-[10.5px] uppercase tracking-[0.16em] text-sidebar-foreground/40">
                  {heading}
                </p>
              )}
              {!isCollapsed ? (
                <ul className="flex flex-col gap-0.5">
                  {group.spaces.map((space) => (
                    <SpaceRow key={space.id} space={space} pathname={pathname} />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="relative mt-auto overflow-hidden border-t border-sidebar-border/60 px-4 pb-5 pt-6">
        <LeafCluster className="pointer-events-none absolute -left-5 bottom-0 w-[7.5rem] rotate-[-14deg] text-brand/20" />
        <LeafCluster className="pointer-events-none absolute -right-3 top-1 w-[5.5rem] rotate-[20deg] text-brand/15" />
        <p className="relative font-hand text-[1.15rem] leading-snug text-sidebar-foreground/65">
          <Leaf className="mr-1.5 inline size-3.5 -translate-y-0.5 text-brand/70" aria-hidden />
          Better food.
          <br />
          Kinder planet.
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
          "flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-[13.5px] no-underline transition",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_18%,transparent)]"
            : "text-sidebar-foreground/68 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
        )}
      >
        <Icon className="size-[1.05rem] shrink-0 opacity-90" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 ? <Badge count={count} /> : null}
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
          "flex h-9 items-center gap-2.5 rounded-xl px-2.5 text-[13px] no-underline transition",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : space.unread > 0
              ? "text-sidebar-foreground hover:bg-sidebar-accent/55"
              : "text-sidebar-foreground/65 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
        )}
      >
        <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{hashLabel}</span>
        {space.unread > 0 ? <Badge count={space.unread} /> : null}
      </Link>
    </li>
  );
}

function Badge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#fff8ef] px-1.5 text-[10px] tabular-nums text-[#0f3d32] dark:bg-[#fff8ef] dark:text-[#0f3d32]",
        className,
      )}
    >
      {count >= 50 ? "50+" : count}
    </span>
  );
}
