import {
  BookOpen,
  CalendarDays,
  FileClock,
  Flag,
  LayoutDashboard,
  Mail,
  Receipt,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";

/**
 * The console's sections, in one table.
 *
 * The sidebar, the mobile sheet and the command-less "jump to" all read this,
 * so a new section is added once. Every href here resolves — nothing is listed
 * before the page behind it exists.
 */

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown as a count pill when the loader supplies one. */
  badgeKey?: "openReports";
};

export type AdminNavGroup = {
  label: string | null;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: null,
    items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard }],
  },
  {
    label: "Community",
    items: [
      { href: "/admin/members", label: "Members", icon: Users },
      { href: "/admin/moderation", label: "Moderation", icon: Flag, badgeKey: "openReports" },
      { href: "/admin/spaces", label: "Spaces", icon: BookOpen },
      { href: "/admin/events", label: "Events", icon: CalendarDays },
    ],
  },
  {
    label: "Products",
    items: [{ href: "/admin/courses", label: "Courses", icon: BookOpen }],
  },
  {
    label: "Revenue",
    items: [
      { href: "/admin/billing", label: "Billing", icon: Receipt },
      { href: "/admin/billing/reconciliation", label: "Reconciliation", icon: FileClock },
      { href: "/admin/billing/webhooks", label: "Webhooks", icon: Webhook },
    ],
  },
  {
    label: "Messaging",
    items: [{ href: "/admin/welcome", label: "Welcome DM", icon: Mail }],
  },
];

export const ADMIN_NAV_ITEMS = ADMIN_NAV.flatMap((group) => group.items);

/**
 * Whether a nav item owns the current path.
 *
 * `/admin` would otherwise light up everywhere, and `/admin/billing` would stay
 * lit on its own sub-pages while Reconciliation is the one actually open — so
 * the longest matching href wins rather than the first.
 */
export function activeAdminHref(pathname: string): string | null {
  const matches = ADMIN_NAV_ITEMS.filter(
    (item) =>
      pathname === item.href ||
      (item.href !== "/admin" && pathname.startsWith(`${item.href}/`)),
  );
  if (matches.length === 0) return null;
  return matches.reduce((longest, item) =>
    item.href.length > longest.href.length ? item : longest,
  ).href;
}
