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
  Handshake,
  Hash,
  Home,
  Map,
  MessageSquare,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SPACE_KIND_ICON } from "@/lib/spaces/kinds";
import type { NavSpace, SpaceGroupWithSpaces } from "@/lib/spaces";
import { cn } from "@/lib/utils";

type Link = { href: string; label: string; icon: LucideIcon };

const PRIMARY: Link[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
];

const SECTIONS: { label: string; links: Link[] }[] = [
  {
    label: "Community",
    links: [
      { href: "/spaces", label: "Spaces", icon: Users },
      { href: "/members", label: "Members", icon: Handshake },
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
 * The left rail.
 *
 * Reddit's arrangement: a short list of destinations, then your communities,
 * grouped and collapsible. Denser than the old rail — 32px rows rather than
 * 40 — because the rail's job is to be scannable, and a taller row means fewer
 * rooms visible before you have to scroll.
 *
 * Everything below the destinations comes from `lib/spaces`, which survived the
 * rebuild: favourites pinned, groups collapsible and remembered, unread counts
 * on every row, and a collapsed group still reporting what is waiting inside it.
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

  return (
    <nav aria-label="Main" className="space-y-4 pb-8 text-[13.5px]">
      <ul className="space-y-0.5">
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
        <div key={section.label} className="border-t border-border/60 pt-3">
          <p className="px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
            {section.label}
          </p>
          <ul className="space-y-0.5">
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

      {favorites.length > 0 ? (
        <div className="border-t border-border/60 pt-3">
          <p className="flex items-center gap-1.5 px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
            <Star className="size-2.5 fill-current" aria-hidden />
            Favourites
          </p>
          <ul className="space-y-0.5">
            {favorites.map((space) => (
              <SpaceRow key={space.id} space={space} pathname={pathname} />
            ))}
          </ul>
        </div>
      ) : null}

      {groups.map((group) => {
        const key = group.id ?? "ungrouped";
        const isCollapsed = collapsed[key] ?? false;
        const groupUnread = group.spaces.reduce((sum, s) => sum + s.unread, 0);
        return (
          <div key={key} className="border-t border-border/60 pt-3">
            <button
              type="button"
              onClick={() => toggle(key)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center gap-1 px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-foreground-muted transition hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "size-2.5 shrink-0 transition-transform",
                  isCollapsed && "-rotate-90",
                )}
                aria-hidden
              />
              <span className="min-w-0 truncate">{group.name}</span>
              {isCollapsed && groupUnread > 0 ? (
                <Badge count={groupUnread} className="ml-auto" />
              ) : null}
            </button>
            {!isCollapsed ? (
              <ul className="space-y-0.5">
                {group.spaces.map((space) => (
                  <SpaceRow key={space.id} space={space} pathname={pathname} />
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
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
          "flex min-h-8 items-center gap-2.5 rounded-ctl px-2.5 py-1.5 no-underline transition",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          active
            ? "bg-brand-wash font-bold text-brand-strong"
            : "font-semibold text-foreground-muted hover:bg-mint hover:text-foreground",
        )}
      >
        <Icon
          className={cn("size-[1.05rem] shrink-0", active && "text-brand")}
          aria-hidden
        />
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
          "flex min-h-8 items-center gap-2.5 rounded-ctl px-2.5 py-1.5 no-underline transition",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          active
            ? "bg-brand-wash font-bold text-brand-strong"
            : space.unread > 0
              ? "font-bold text-foreground hover:bg-mint"
              : "font-semibold text-foreground-muted hover:bg-mint hover:text-foreground",
        )}
      >
        <Icon
          className={cn("size-[0.95rem] shrink-0", active && "text-brand")}
          aria-hidden
        />
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
        "inline-flex min-w-[1.1rem] shrink-0 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold tabular-nums text-[#06120d]",
        className,
      )}
    >
      {count >= 50 ? "50+" : count}
    </span>
  );
}
