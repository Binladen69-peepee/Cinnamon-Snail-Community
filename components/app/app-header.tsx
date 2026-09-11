import Link from "next/link";
import { Bell, MessageSquare, Plus, Shield } from "lucide-react";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { totalUnreadForUser } from "@/lib/messages/conversations";
import { BrandMark } from "@/components/brand/brand-mark";
import { CommandPalette } from "@/components/layout/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { AccountMenu } from "@/components/app/account-menu";

/**
 * The member app bar.
 *
 * Separate from the marketing `AppNav`, which serves the sales pages and has to
 * be transparent over a hero video. This one is a fixed, opaque band: the app
 * is a tool, and its chrome should not animate or get out of the way.
 *
 * Three tracks, Reddit's arrangement — brand, a wide command field, then
 * actions. The field is the widest thing in the bar because search is how you
 * get anywhere in a community once it has more than a few rooms.
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
    <header className="sticky top-0 z-50 border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:gap-4 sm:px-4">
        <BrandMark href="/home" className="shrink-0" />

        <div className="mx-auto hidden min-w-0 max-w-xl flex-1 md:block">
          <CommandPalette />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* Create is a first-class action in the bar, not something you find
              inside a page. */}
          <Link
            href="/compose"
            className="mr-1 hidden h-9 items-center gap-1.5 rounded-full bg-forest px-3.5 text-[13.5px] font-bold text-paper no-underline transition hover:bg-deep-forest sm:inline-flex dark:bg-brand dark:text-on-brand dark:hover:bg-brand-strong"
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

          <ThemeToggle />

          <AccountMenu
            name={name}
            handle={session.user.handle}
            signOutAction={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
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
      className="relative grid size-9 place-items-center rounded-full text-foreground-muted no-underline transition hover:bg-mint hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {icon}
      <span className="sr-only">{label}</span>
      {count > 0 ? (
        <span
          className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-terracotta px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-surface"
          aria-label={`${count} unread`}
        >
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
