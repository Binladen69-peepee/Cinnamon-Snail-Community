"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  FileClock,
  GraduationCap,
  Home,
  Mail,
  Plus,
  Receipt,
  Webhook,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-mark";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * The admin rail, built to the supplied design.
 *
 * Structure is the design's: a brand row, an unlabelled group of destinations,
 * a PRODUCTS group with an add button, an OTHER group, and an account card
 * pinned to the bottom.
 *
 * The items are this project's. The design's rail lists Coaching, Digital
 * Downloads, Webinar, Memberships, Bundles and Plan, none of which exist here —
 * putting them in would have added six links that 404, which is the one thing
 * every page in this rebuild has avoided.
 */

type Item = { href: string; label: string; icon: typeof Home };

const MAIN: Item[] = [
  { href: "/admin", label: "Home", icon: Home },
  { href: "/admin/billing", label: "Billing", icon: Receipt },
  { href: "/admin/welcome", label: "Emails", icon: Mail },
];

const PRODUCTS: Item[] = [
  { href: "/admin/courses", label: "Courses", icon: GraduationCap },
];

const OTHER: Item[] = [
  { href: "/admin/billing/reconciliation", label: "Reconciliation", icon: FileClock },
  { href: "/admin/billing/webhooks", label: "Webhooks", icon: Webhook },
];

export function AdminSidebar({
  name,
  role,
  avatarUrl,
}: {
  name: string;
  role: string;
  avatarUrl: string | null;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="mb-3 flex items-center gap-2 px-2 py-1">
        <BrandLogo className="size-6 text-brand" />
        <span className="font-display text-[17px] font-bold tracking-[-0.01em] text-foreground">
          Vegan U
        </span>
      </div>

      <Group items={MAIN} pathname={pathname} />

      <GroupLabel label="Products" action={{ href: "/admin/courses?new=1", label: "New product" }} />
      <Group items={PRODUCTS} pathname={pathname} />

      <GroupLabel label="Other" />
      <Group items={OTHER} pathname={pathname} />

      <Link
        href="/home"
        className="mt-auto rounded-ctl border border-border bg-background px-3 py-2.5 text-[13px] font-semibold text-foreground no-underline transition hover:border-hairline-firm"
      >
        <span className="flex items-center gap-2.5">
          <Avatar name={name} src={avatarUrl} size="sm" className="size-8" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold text-foreground">
              {name}
            </span>
            <span className="block truncate text-[11.5px] font-semibold text-foreground-muted">
              {role}
            </span>
          </span>
          <ChevronsUpDown
            className="size-4 shrink-0 text-foreground-muted"
            aria-hidden
          />
        </span>
      </Link>
    </div>
  );
}

function GroupLabel({
  label,
  action,
}: {
  label: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-2 px-2 pb-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
        {label}
      </span>
      {action ? (
        <Link
          href={action.href}
          aria-label={action.label}
          className="grid size-5 place-items-center rounded-chip bg-default text-foreground-muted no-underline transition hover:bg-brand-wash hover:text-brand-strong"
        >
          <Plus className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function Group({ items, pathname }: { items: Item[]; pathname: string }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        // `/admin` would otherwise light up on every admin page.
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-ctl px-2.5 py-2 text-[13.5px] font-semibold no-underline transition",
                active
                  ? "bg-brand-wash text-brand-strong"
                  : "text-foreground-muted hover:bg-mint hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
