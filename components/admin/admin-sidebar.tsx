"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-mark";
import { Avatar } from "@/components/ui/avatar";
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
    <div className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <Link
        href="/admin"
        className="mb-3 flex items-center gap-2 rounded-ctl px-2 py-1.5 no-underline"
      >
        <BrandLogo className="size-6 text-brand" />
        <span className="min-w-0">
          <span className="block truncate font-display text-[15px] font-bold leading-tight tracking-[-0.01em] text-foreground">
            Vegan University
          </span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
            Console
          </span>
        </span>
      </Link>

      {ADMIN_NAV.map((group) => (
        <div key={group.label ?? "main"}>
          {group.label ? (
            <p className="mt-4 px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground-muted">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
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
                      "flex items-center gap-2.5 rounded-ctl px-2.5 py-2 text-[13px] font-semibold no-underline transition",
                      current
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-foreground-muted hover:bg-default hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {badge ? (
                      <span className="shrink-0 rounded-full bg-danger px-1.5 text-[10px] font-bold tabular-nums text-danger-foreground">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="mt-auto space-y-2 pt-4">
        <Link
          href="/home"
          className="flex items-center gap-1.5 rounded-ctl px-2.5 py-2 text-[12.5px] font-semibold text-foreground-muted no-underline transition hover:bg-default hover:text-foreground"
        >
          <ArrowUpRight className="size-3.5" aria-hidden />
          Back to the community
        </Link>

        <div className="vu-raise flex items-center gap-2.5 rounded-ctl border border-border bg-surface px-2.5 py-2">
          <Avatar name={name} src={avatarUrl} size="sm" className="size-8" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-bold text-foreground">
              {name}
            </span>
            <span className="block truncate text-[11px] font-semibold text-foreground-muted">
              {role}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
