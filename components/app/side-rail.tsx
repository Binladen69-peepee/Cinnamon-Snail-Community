"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { CountBadge } from "@/components/app/ui";
import {
  MEMBER_HOME_HREF,
  MEMBER_NAV_GROUPS,
  isNavActive,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Fixed left destinations: quiet group labels, a soft active pill, unread
 * counts. The destinations come from `lib/navigation`, which the drawer, the
 * phone sheet and the search palette read too.
 *
 * There is no list of rooms under it any more. The Kitchen Table reads every
 * general room (DEC-078), so a per-space list was a second way into the same
 * posts, and its `#` and emoji glyphs made the menu read like a chat client.
 */
export function SideRail({
  unread,
  staff = false,
}: {
  /** Counts keyed by destination href. Only Messages carries one today. */
  unread: Record<string, number>;
  /** Staff also get the console, which the header hides on phones. */
  staff?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The lockup lives in the rail rather than the bar above it, so the
          panel reads as the product's own edge instead of as a list tucked
          under a header. It keeps the bar's height, which is what lines the
          two up across the fold. */}
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
        <BrandMark href={MEMBER_HOME_HREF} className="min-w-0" />
      </div>

      <nav
        aria-label="Main"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4"
      >
        {MEMBER_NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-2.5 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
              {group.label}
            </p>
            <ul className="flex flex-col gap-px">
              {group.links.map((link) => (
                <Row
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  icon={link.icon}
                  active={isNavActive(pathname, link)}
                  count={unread[link.href] ?? 0}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {staff ? (
        <div className="shrink-0 border-t border-sidebar-border px-3 py-3">
          <ul className="flex flex-col gap-px">
            <Row
              href="/admin"
              label="Admin console"
              icon={Shield}
              active={pathname === "/admin" || pathname.startsWith("/admin/")}
              count={0}
            />
          </ul>
        </div>
      ) : null}
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
