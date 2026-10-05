"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-mark";
import { Avatar } from "@/components/ui/avatar";
import { CountBadge } from "@/components/app/ui";
import { ADMIN_NAV, activeAdminHref } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

/**
 * The console rail.
 *
 * Sections come from `lib/admin/nav`, so this and the mobile sheet cannot
 * disagree about what the console contains. Active state is worked out from the
 * path rather than passed in, which keeps it right through back and forward.
 */
export function AdminSidebar({
  name,
  role,
  avatarUrl,
  badges,
}: {
  name: string;
  role: string;
  avatarUrl: string | null;
  badges?: { openReports?: number };
}) {
  const pathname = usePathname();
  const active = activeAdminHref(pathname);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Link
        href="/admin"
        className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4 no-underline"
      >
        <BrandLogo className="size-6 text-brand" />
        <span className="min-w-0">
          <span className="block truncate text-label font-semibold leading-tight tracking-[-0.01em] text-foreground">
            Vegan University
          </span>
          <span className="block text-micro font-medium text-foreground-muted">
            Admin console
          </span>
        </span>
      </Link>

      <nav aria-label="Console" className="flex flex-col gap-5 px-3 py-4">

      {ADMIN_NAV.map((group) => (
        <div key={group.label ?? "main"} className="flex flex-col gap-1">
          {group.label ? (
            <p className="px-2.5 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
              {group.label}
            </p>
          ) : null}
          <ul className="flex flex-col gap-px">
            {group.items.map((item) => {
              const Icon = item.icon;
              const current = active === item.href;
              const badge = item.badgeKey ? badges?.[item.badgeKey] : undefined;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-ctl px-2.5 text-label font-medium no-underline transition",
                      current
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-[1.125rem] shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <CountBadge count={badge ?? 0} label={`${badge ?? 0} waiting`} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border p-3">
        <Link
          href="/home"
          className="flex h-9 items-center gap-2.5 rounded-ctl px-2.5 text-label font-medium text-foreground-muted no-underline transition hover:bg-surface-muted hover:text-foreground"
        >
          <ArrowUpRight className="size-4" aria-hidden />
          Back to the community
        </Link>

        <div className="flex items-center gap-2.5 rounded-ctl px-2.5 py-1.5">
          <Avatar name={name} src={avatarUrl} size="sm" className="size-8" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-label font-semibold text-foreground">
              {name}
            </span>
            <span className="block truncate text-caption text-foreground-muted">
              {role}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
