"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Hash, Star } from "lucide-react";
import { SPACE_KIND_ICON } from "@/lib/spaces/kinds";
import type { NavSpace, SpaceGroupWithSpaces } from "@/lib/spaces";
import { cn } from "@/lib/utils";

/**
 * The spaces section of the rail.
 *
 * This is the part that had to scale. A flat alphabetical list stops working at
 * about a dozen spaces, so: favourites pinned at the top, then collapsible
 * groups, then unread counts so a long list still tells you where to look.
 * Groups collapse per member and the state is remembered, because the point of
 * a group is being able to fold away the rooms you are not in today.
 */
export function SpaceNav({
  favorites,
  groups,
}: {
  favorites: NavSpace[];
  groups: SpaceGroupWithSpaces[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = sessionStorage.getItem("vu-space-groups");
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  function toggle(key: string) {
    setCollapsed((current) => {
      const next = { ...current, [key]: !current[key] };
      try {
        sessionStorage.setItem("vu-space-groups", JSON.stringify(next));
      } catch {
        // Private mode; remembering is a convenience, not a requirement.
      }
      return next;
    });
  }

  if (favorites.length === 0 && groups.length === 0) return null;

  return (
    <div className="mt-5 space-y-4 border-t border-border/60 pt-4">
      {favorites.length > 0 ? (
        <Section
          label="Favourites"
          icon={<Star className="size-3 fill-current" aria-hidden />}
        >
          {favorites.map((space) => (
            <SpaceRow key={space.id} space={space} pathname={pathname} />
          ))}
        </Section>
      ) : null}

      {groups.map((group) => {
        const key = group.id ?? "ungrouped";
        const isCollapsed = collapsed[key] ?? false;
        const unread = group.spaces.reduce((sum, space) => sum + space.unread, 0);
        return (
          <div key={key}>
            <button
              type="button"
              onClick={() => toggle(key)}
              aria-expanded={!isCollapsed}
              className="group/gh flex w-full items-center gap-1 px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted transition hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "size-3 shrink-0 transition-transform",
                  isCollapsed && "-rotate-90",
                )}
                aria-hidden
              />
              <span className="min-w-0 truncate">{group.name}</span>
              {/* Collapsed groups still report what is waiting inside, or
                  folding one away would hide activity. */}
              {isCollapsed && unread > 0 ? (
                <span className="ml-auto rounded-full bg-brand px-1.5 text-[10px] font-bold tabular-nums text-[#06120d]">
                  {unread >= 50 ? "50+" : unread}
                </span>
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
    </div>
  );
}

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
        {icon}
        {label}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
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
          "relative flex min-h-9 items-center gap-2 rounded-ctl px-3 py-1.5 text-[13.5px] no-underline transition",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          active
            ? "bg-brand-wash font-bold text-brand-strong"
            : space.unread > 0
              ? "font-bold text-foreground hover:bg-mint/70"
              : "font-semibold text-foreground-muted hover:bg-mint/70 hover:text-foreground",
        )}
      >
        {active ? (
          <span
            className="absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-r-full bg-brand"
            aria-hidden
          />
        ) : null}
        <Icon
          className={cn("size-[0.95rem] shrink-0", active && "text-brand")}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{space.name}</span>
        {space.unread > 0 ? (
          <span className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-bold tabular-nums text-[#06120d]">
            {space.unread >= 50 ? "50+" : space.unread}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
