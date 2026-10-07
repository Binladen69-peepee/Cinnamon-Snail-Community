import {
  Clapperboard,
  Bot,
  BookOpen,
  ClipboardList,
  FileClock,
  Flag,
  FolderTree,
  LayoutDashboard,
  Lightbulb,
  Mail,
  Map,
  Receipt,
  Shuffle,
  Users,
  UsersRound,
  Video,
  Webhook,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * The console's sections, in one table.
 *
 * The sidebar, the mobile sheet and the command-less "jump to" all read this,
 * so a new section is added once. Every href here resolves — nothing is listed
 * before the page behind it exists.
 *
 * Staff see the members' words: "Live classes" for what the database still
 * calls events (the address stays `/admin/events`), and "Crews" for the
 * groups that replaced cohorts.
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
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Community",
    items: [
      { href: "/admin/members", label: "Members", icon: Users },
      { href: "/admin/moderation", label: "Moderation", icon: Flag, badgeKey: "openReports" },
      { href: "/admin/spaces", label: "Spaces", icon: BookOpen },
      { href: "/admin/events", label: "Live classes", icon: Video },
      { href: "/admin/ideas", label: "Ideas", icon: Lightbulb },
      { href: "/admin/crews", label: "Crews", icon: UsersRound },
      { href: "/admin/bulletin", label: "Bulletin review", icon: ClipboardList },
      { href: "/admin/variations", label: "Recipe variations", icon: Shuffle },
    ],
  },
  {
    label: "Products",
    items: [
      { href: "/admin/courses", label: "Courses", icon: BookOpen },
      { href: "/admin/courses/categories", label: "Class categories", icon: FolderTree },
      { href: "/admin/videos", label: "Video library", icon: Clapperboard },
      { href: "/admin/roadmap", label: "Roadmap", icon: Map },
      { href: "/admin/challenges", label: "Challenges", icon: Flag },
    ],
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
    items: [
      { href: "/admin/welcome", label: "Welcome DM", icon: Mail },
      { href: "/admin/automation", label: "Automation", icon: Workflow },
      { href: "/admin/cohost", label: "AI cohost", icon: Bot },
    ],
  },
];

export const ADMIN_NAV_ITEMS = ADMIN_NAV.flatMap((group) => group.items);

/**
 * Whether a nav item owns the current path.
 *
 * `/admin` would otherwise light up everywhere, and `/admin/billing` would stay
 * lit on its own sub-pages while Reconciliation is the one actually open — so
 * the longest matching href wins rather than the first. The same rule keeps
 * Class categories, not Courses, lit on `/admin/courses/categories`.
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

/** The top bar's title: the section the page belongs to, by the same rule. */
export function adminPageTitle(pathname: string): string {
  const href = activeAdminHref(pathname);
  return ADMIN_NAV_ITEMS.find((item) => item.href === href)?.label ?? "Admin";
}

/** The cookie that remembers a collapsed rail, read by the layout. */
export const ADMIN_RAIL_COOKIE = "vu-admin-rail";
