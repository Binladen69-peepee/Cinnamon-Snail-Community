"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { MEMBER_NAV_LINKS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MemberSidebar({
  spaces,
}: {
  spaces: { name: string; slug: string; coverUrl: string | null; memberCount?: number }[];
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[260px] shrink-0 lg:block">
      <div className="vu-sidebar sticky top-[90px] p-3">
        <nav className="space-y-1" aria-label="Member">
          {MEMBER_NAV_LINKS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/home"
                ? pathname === "/home"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex min-h-11 items-center gap-3 rounded-[0.85rem] px-3 py-2 text-sm font-semibold text-foreground-muted no-underline transition hover:bg-mint hover:text-forest",
                  active && "bg-sage text-forest",
                )}
              >
                {active ? (
                  <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" aria-hidden />
                ) : null}
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">
            Spaces
          </p>
          <ul className="mt-2 space-y-1">
            {spaces.map((space) => {
              const href = `/spaces/${space.slug}`;
              const active = pathname === href;
              return (
                <li key={space.slug}>
                  <Link
                    href={href}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-[0.85rem] px-3 py-2 text-sm font-medium text-foreground-muted no-underline transition hover:bg-mint hover:text-forest",
                      active && "bg-sage text-forest",
                    )}
                  >
                    <Avatar name={space.name} src={space.coverUrl} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate">{space.name}</span>
                      {typeof space.memberCount === "number" ? (
                        <span className="block text-[11px] font-normal text-foreground-muted">
                          {space.memberCount} members
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </aside>
  );
}
