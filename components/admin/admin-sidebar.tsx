"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-mark";
import { CountBadge } from "@/components/app/ui";
import { AdminRailToggle } from "@/components/admin/admin-rail-toggle";
import { AdminUserMenu } from "@/components/admin/admin-user-menu";
import { ThemeButton } from "@/components/theme/theme-button";
import { ADMIN_NAV, activeAdminHref } from "@/lib/admin/nav";
import { MEMBER_HOME_HREF } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * The console rail (DEC-088).
 *
 * After the client's reference: the brand on a filled tile with the collapse
 * control beside it, a light list of sections in which the open one is a
 * raised white pill, and the signed-in person at the foot. It sits on the
 * page's own ground in the palette's roles, so it follows every palette and
 * both modes.
 *
 * Sections come from `lib/admin/nav`, so this and the phone drawer cannot
 * disagree about what the console contains, and the active row is worked out
 * from the path, which keeps it right through back and forward. As a `rail`
 * it can collapse to its icons (`AdminRailToggle`); the CSS keyed on
 * `data-rail` hides the labels, so the server-rendered width and the toggled
 * one are the same markup. In the `drawer` nothing collapses.
 */
export function AdminSidebar({
  name,
  role,
  avatarUrl,
  badges,
  variant = "rail",
  signOutAction,
}: {
  name: string;
  role: string;
  avatarUrl: string | null;
  badges?: { openReports?: number };
  variant?: "rail" | "drawer";
  signOutAction?: () => Promise<void>;
}) {
  const pathname = usePathname();
  const active = activeAdminHref(pathname);
  const rail = variant === "rail";

  return (
    <div className="flex h-full flex-col">
      <div className="vu-rail-row flex h-16 shrink-0 items-center gap-2 px-4">
        <Link
          href="/admin"
          title="Dashboard"
          className="flex min-w-0 items-center gap-2.5 rounded-ctl no-underline"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-ctl bg-brand-fill text-brand-fill-foreground shadow-e1">
            <BrandLogo className="size-5" />
          </span>
          <span className="vu-rail-label min-w-0">
            <span className="block truncate text-body font-semibold leading-tight tracking-[-0.01em] text-foreground">
              Vegan University
            </span>
            <span className="block text-caption leading-tight text-foreground-muted">
              Admin console
            </span>
          </span>
        </Link>
        {rail ? (
          <AdminRailToggle mode="collapse" className="vu-rail-wide ml-auto" />
        ) : null}
      </div>

      {rail ? (
        <div className="vu-rail-narrow flex justify-center pb-2">
          <AdminRailToggle mode="expand" />
        </div>
      ) : null}

      <nav aria-label="Console" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4 pt-1">
        {ADMIN_NAV.map((group) => (
          <div key={group.label ?? "main"} className="flex flex-col gap-0.5">
            {group.label ? (
              <>
                <p className="vu-rail-label px-3 pb-1 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                  {group.label}
                </p>
                {rail ? (
                  <span className="vu-rail-narrow mx-auto mb-1 h-px w-6 bg-border" aria-hidden />
                ) : null}
              </>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const current = active === item.href;
                const badge = item.badgeKey ? (badges?.[item.badgeKey] ?? 0) : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={item.label}
                      aria-current={current ? "page" : undefined}
                      className="vu-admin-nav-link vu-rail-row relative flex h-10 items-center gap-3 rounded-ctl px-3 text-label font-medium no-underline transition"
                    >
                      <Icon className="vu-admin-nav-icon size-4.5 shrink-0" aria-hidden />
                      <span className="vu-rail-label min-w-0 flex-1 truncate">{item.label}</span>
                      <CountBadge
                        count={badge}
                        label={`${badge} waiting`}
                        className="vu-rail-label"
                      />
                      {rail && badge > 0 ? (
                        // Collapsed, the count becomes a dot on the icon; the
                        // link's title and the page say how many.
                        <span
                          className="vu-rail-narrow absolute right-3 top-2 size-2 rounded-full bg-highlight ring-2 ring-background"
                          aria-hidden
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 flex-col gap-1 border-t border-border p-3">
        {/* The console follows the member's palette and mode too (DEC-082). */}
        <div className="vu-rail-wide">
          <ThemeButton />
        </div>
        {rail ? (
          <div className="vu-rail-narrow flex justify-center">
            <ThemeButton variant="icon" />
          </div>
        ) : null}
        <Link
          href={MEMBER_HOME_HREF}
          title="Back to the community"
          className={cn(
            "vu-admin-nav-link vu-rail-row flex h-10 items-center gap-3 rounded-ctl px-3 text-label font-medium no-underline transition",
          )}
        >
          <ArrowUpRight className="size-4.5 shrink-0" aria-hidden />
          <span className="vu-rail-label">Back to the community</span>
        </Link>
        <AdminUserMenu name={name} role={role} avatarUrl={avatarUrl} signOutAction={signOutAction} />
      </div>
    </div>
  );
}
