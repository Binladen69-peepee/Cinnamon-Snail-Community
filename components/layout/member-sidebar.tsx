"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MEMBER_NAV_GROUPS } from "@/lib/navigation";
import { SpaceNav } from "@/components/layout/space-nav";
import type { NavSpace, SpaceGroupWithSpaces } from "@/lib/spaces";
import { cn } from "@/lib/utils";

/**
 * The workspace rail.
 *
 * Grouped rather than one flat list of nine, and the spaces list scrolls on its
 * own so the navigation above it stays reachable once there are more than a
 * handful — the old rail simply grew until it ran off the bottom of a laptop
 * screen.
 *
 * No card around it: the rail sits on the page ground with the active row
 * carrying the only fill, which stops it competing with the feed beside it.
 */
export function MemberSidebar({
  favorites,
  spaceGroups,
  unread,
}: {
  favorites: NavSpace[];
  spaceGroups: SpaceGroupWithSpaces[];
  /** Per-destination unread counts, keyed by href. */
  unread?: Record<string, number>;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/home"
      ? pathname === "/home"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="hidden w-[248px] shrink-0 lg:block">
      <div className="sticky top-[90px] max-h-[calc(100vh-7rem)] overflow-y-auto pb-6 pr-1">
        <nav aria-label="Member" className="space-y-5">
          {MEMBER_NAV_GROUPS.map((group, index) => (
            <div key={group.label ?? `group-${index}`}>
              {group.label ? (
                <p className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
                  {group.label}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {group.links.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  const count = unread?.[item.href] ?? 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex min-h-10 items-center gap-2.5 rounded-ctl px-3 py-2 text-[14px] font-semibold no-underline transition",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                          active
                            ? "bg-brand-wash text-brand-strong"
                            : "text-foreground-muted hover:bg-mint/70 hover:text-foreground",
                        )}
                      >
                        {active ? (
                          <span
                            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
                            aria-hidden
                          />
                        ) : null}
                        <Icon
                          className={cn(
                            "size-[1.05rem] shrink-0",
                            active ? "text-brand" : "",
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {count > 0 ? (
                          <span className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold tabular-nums text-[#06120d]">
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <SpaceNav favorites={favorites} groups={spaceGroups} />
      </div>
    </aside>
  );
}
