import Link from "next/link";
import { Bell, MessageSquare, Plus, Shield } from "lucide-react";
import { auth } from "@/auth";
import { signOutAction } from "@/app/(auth)/sign-out-action";
import { prisma } from "@/lib/db";
import { totalUnreadForUser } from "@/lib/messages/conversations";
import { BrandMark } from "@/components/brand/brand-mark";
import { NavSearch } from "@/components/layout/nav-search";
import { Avatar } from "@/components/ui/avatar";
import { AccountMenu } from "@/components/app/account-menu";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Member app bar — brand, command search, create + account actions.
 * See PROJECT.md — the member shell and feed layout.
 */
export async function AppHeader() {
  const session = await auth();
  if (!session?.user.id) return null;

  const [notifications, messages] = await Promise.all([
    prisma.notification
      .count({ where: { userId: session.user.id, readAt: null } })
      .catch(() => 0),
    totalUnreadForUser(session.user.id).catch(() => 0),
  ]);

  const isStaff = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN",
  );
  const name = session.user.name || session.user.handle;

  return (
    <header
      data-app-header
      className="sticky top-0 z-50 border-b border-border bg-background/92 backdrop-blur-md"
    >
      <div className="flex h-14 w-full items-center gap-3 px-3 sm:gap-4 sm:px-5">
        <BrandMark href="/home" className="shrink-0" />

        <div className="mx-auto hidden min-w-0 max-w-xl flex-1 md:block">
          <NavSearch />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <Link
            href="/compose"
            className="vu-btn vu-btn-primary mr-1.5 hidden h-9 items-center gap-1.5 px-3.5 text-[13.5px] no-underline sm:inline-flex"
          >
            <Plus className="size-4" aria-hidden />
            Create
          </Link>

          <IconLink
            href="/notifications"
            label="Notifications"
            count={notifications}
            icon={<Bell className="size-[1.15rem]" aria-hidden />}
          />
          <IconLink
            href="/messages"
            label="Messages"
            count={messages}
            icon={<MessageSquare className="size-[1.15rem]" aria-hidden />}
          />
          {isStaff ? (
            <IconLink
              href="/admin/billing"
              label="Admin"
              icon={<Shield className="size-[1.15rem]" aria-hidden />}
            />
          ) : null}

          {/* Light and dark belongs beside the other controls, not floating
              over the feed above the tab bar where it covered content and was
              the only chrome that moved with the page. */}
          <ThemeToggle />

          <AccountMenu
            name={name}
            handle={session.user.handle}
            signOutAction={signOutAction}
          >
            <Avatar name={name} src={session.user.image} size="sm" />
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
      className="relative grid size-9 place-items-center rounded-full text-foreground-muted no-underline transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {icon}
      <span className="sr-only">{label}</span>
      {count > 0 ? (
        <span
          className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] tabular-nums text-danger-foreground ring-2 ring-background"
          aria-label={`${count} unread`}
        >
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
