import Link from "next/link";
import { Bell, MessageSquare, Plus, Search, Shield } from "lucide-react";
import { auth } from "@/auth";
import { signOutAction } from "@/app/(auth)/sign-out-action";
import { prisma } from "@/lib/db";
import { totalUnreadForUser } from "@/lib/messages/conversations";
import { MEMBER_HOME_HREF } from "@/lib/navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { NavSearch } from "@/components/layout/nav-search";
import { Avatar } from "@/components/ui/avatar";
import { AccountMenu } from "@/components/app/account-menu";
import { CountBadge } from "@/components/app/ui";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Member app bar — brand, command search, create + account actions.
 * See PROJECT.md — the member shell and feed layout.
 *
 * `menu` is the navigation drawer's trigger, shown below `lg` where the rail
 * is not; the layout passes it because the layout owns the rail's data. The
 * layout also passes the unread message count it already loaded for the
 * rail, so the page does not count the same messages twice.
 */
export async function AppHeader({
  menu,
  unreadMessages,
}: {
  menu?: React.ReactNode;
  unreadMessages?: number;
}) {
  const session = await auth();
  if (!session?.user.id) return null;

  const [notifications, messages] = await Promise.all([
    prisma.notification
      .count({ where: { userId: session.user.id, inApp: true, readAt: null } })
      .catch(() => 0),
    unreadMessages ?? totalUnreadForUser(session.user.id).catch(() => 0),
  ]);

  const isStaff = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN",
  );
  const name = session.user.name || session.user.handle;

  return (
    <header
      data-app-header
      className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md"
    >
      <div className="flex h-14 w-full items-center gap-2 px-3 sm:gap-3 sm:px-6">
        {menu}

        {/* The rail carries the wordmark from `lg` up, where it is visible.
            Below that there is no rail, so the bar keeps it. */}
        <BrandMark href={MEMBER_HOME_HREF} className="shrink-0 lg:hidden" compactBelowSm />

        <div className="mx-auto hidden min-w-0 max-w-xl flex-1 md:block">
          <NavSearch />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <Link
            href="/compose"
            className="vu-btn vu-btn-primary mr-2 hidden h-9 items-center gap-1.5 px-3.5 text-label no-underline sm:inline-flex"
          >
            <Plus className="size-4" aria-hidden />
            Create
          </Link>

          {/* The search field needs more room than a phone's bar has, and
              search no longer holds a tab, so below `md` it is a button to
              the search page instead. */}
          <span className="inline-flex md:hidden">
            <IconLink
              href="/search"
              label="Search"
              icon={<Search className="size-[1.125rem]" aria-hidden />}
            />
          </span>
          <IconLink
            href="/notifications"
            label="Notifications"
            count={notifications}
            icon={<Bell className="size-[1.125rem]" aria-hidden />}
          />
          <IconLink
            href="/messages"
            label="Messages"
            count={messages}
            icon={<MessageSquare className="size-[1.125rem]" aria-hidden />}
          />
          {/* On phones staff reach the console from the menu drawer instead;
              at 320px the bar has room for the controls every member needs
              and no more. */}
          {isStaff ? (
            <span className="hidden sm:inline-flex">
              <IconLink
                href="/admin/billing"
                label="Admin"
                icon={<Shield className="size-[1.125rem]" aria-hidden />}
              />
            </span>
          ) : null}

          {/* Light and dark belongs beside the other controls, not floating
              over the feed above the tab bar where it covered content and was
              the only chrome that moved with the page. */}
          <ThemeToggle className="rounded-ctl" />

          <AccountMenu
            name={name}
            handle={session.user.handle}
            signOutAction={signOutAction}
          >
            <Avatar name={name} src={session.user.image} size="sm" className="size-8" />
          </AccountMenu>
        </div>
      </div>
    </header>
  );
}

function IconLink({
  href,
  label,
  icon,
  count = 0,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
}) {
  return (
    <Link
      href={href}
      title={label}
      className="relative grid size-9 place-items-center rounded-ctl text-foreground-muted no-underline transition hover:bg-surface-muted hover:text-foreground"
    >
      {icon}
      <span className="sr-only">{label}</span>
      <CountBadge
        count={count}
        max={9}
        label={`${count} unread`}
        className="absolute -right-0.5 -top-0.5 ring-2 ring-background"
      />
    </Link>
  );
}
