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
 * Member destinations, in the shadcn sidebar shape: grouped labels, quiet
 * rows, a filled pill for the page you are on. Spaces sit under one heading
 * so the rail matches the feed mock without a second "Favourites" block.
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
        // Private mode; remembering is a convenience, not a requirement.
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
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 py-1">
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
          <div key={section.label} className="flex flex-col gap-1">
            <p className="px-2 text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/45">
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
            <div key={key} className="flex flex-col gap-1">
              {collapsible ? (
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-1 px-2 text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/45 transition hover:text-sidebar-foreground"
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
                <p className="px-2 text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/45">
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

      <p className="relative mt-auto overflow-hidden px-3 pb-4 pt-8 text-[13px] leading-snug text-sidebar-foreground/40">
        <LeafCluster className="pointer-events-none absolute -left-6 bottom-1 w-24 rotate-[-18deg] text-brand/25" />
        <LeafCluster className="pointer-events-none absolute -right-4 top-2 w-20 rotate-[22deg] text-brand/20" />
        <span className="relative inline-flex items-center gap-1.5 font-hand text-[1.05rem] text-sidebar-foreground/70">
          <Leaf className="size-3.5" aria-hidden />
          Better food.
          <br />
          Kinder planet.
        </span>
      </p>
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
          "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] no-underline transition",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
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

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] no-underline transition",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : space.unread > 0
              ? "text-sidebar-foreground hover:bg-sidebar-accent/60"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{space.name}</span>
        {space.unread > 0 ? <Badge count={space.unread} /> : null}
      </Link>
    </li>
  );
}

function Badge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] tabular-nums text-on-brand",
        className,
      )}
    >
      {count >= 50 ? "50+" : count}
    </span>
  );
}
