"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { MEMBER_CREATE_LINK, MEMBER_NAV_LINKS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MemberSidebar({
  spaces,
}: {
  spaces: { name: string; slug: string; coverUrl: string | null }[];
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[248px] shrink-0 lg:block">
      <div className="vu-sidebar sticky top-24 p-3">
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
                  "flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white",
                  active && "bg-white/15 text-white",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
          <Link
            href={MEMBER_CREATE_LINK.href}
            className="flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white"
          >
            <MEMBER_CREATE_LINK.icon className="size-4 shrink-0" aria-hidden />
            {MEMBER_CREATE_LINK.label}
          </Link>
        </nav>
        <div className="mt-5">
          <p className="px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
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
                      "flex items-center gap-2 rounded-[8px] px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white",
                      active && "bg-white/15 text-white",
                    )}
                  >
                    <Avatar name={space.name} src={space.coverUrl} size="sm" />
                    <span className="truncate">{space.name}</span>
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
