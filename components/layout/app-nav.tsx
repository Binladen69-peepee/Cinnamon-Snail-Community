import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { NavIconLink, NavIconSubmit, NavProfileLink } from "@/components/layout/nav-icon";
import { MEMBER_NAV_LINKS } from "@/lib/navigation";
import { totalUnreadForUser } from "@/lib/messages/conversations";
import { BrandMark } from "@/components/brand/brand-mark";
import { CommandPalette } from "@/components/layout/command-palette";
import { NavMobileSheet } from "@/components/layout/nav-mobile-sheet";
import { CheckoutButton } from "@/components/marketing/checkout-button";
import { NavShell } from "@/components/layout/nav-shell";

const signedOutLinks = [
  { href: "/membership", label: "Membership" },
  { href: "/courses", label: "Courses" },
  { href: "/community", label: "Community" },
  { href: "/about", label: "About" },
];

/**
 * The app bar.
 *
 * Three tracks rather than one flat row: brand on the left, a centred pill of
 * navigation, and actions on the right. Signed-out visitors get the pill plus
 * the single call to action the sales pages are built around; members get the
 * search field and their icon rail. The bar floats on a translucent, blurred
 * surface with a hairline, so it reads as a layer above the page instead of a
 * band welded to the top of it.
 */
export async function AppNav() {
  const session = await auth().catch(() => null);
  const signedIn = Boolean(session?.sessionId);
  const homeHref = signedIn ? "/home" : "/";

  let unread = 0;
  let unreadMessages = 0;
  if (signedIn && session?.user.id && process.env.DATABASE_URL) {
    try {
      [unread, unreadMessages] = await Promise.all([
        prisma.notification.count({
          where: { userId: session.user.id, readAt: null },
        }),
        totalUnreadForUser(session.user.id),
      ]);
    } catch {
      unread = 0;
      unreadMessages = 0;
    }
  }
  const isAdmin = Boolean(
    session?.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN"),
  );

  return (
    <NavShell>
      {/* Transparent by default so the hero video shows through; the surface
          fades in on scroll (see .vu-nav-surface in globals.css) once cream
          content starts passing underneath. Kept as its own element so the
          nav content never inherits the blur filter. */}
      <div className="vu-nav-surface absolute inset-0" />

      <div className="vu-gutter relative">
        <div className="vu-feed-shell flex h-[72px] items-center gap-3">
          <BrandMark href={homeHref} className="min-w-0" />

          {/* Centre track. For members this is the command centre, not a
              search box that navigates away from the feed. */}
          {signedIn ? (
            <div className="mx-auto hidden min-w-0 max-w-md flex-1 md:block">
              <CommandPalette />
            </div>
          ) : (
            <nav
              aria-label="Main"
              className="mx-auto hidden items-center gap-1 rounded-full border border-sand/80 bg-surface/70 p-1 shadow-[0_2px_10px_rgba(15,61,50,0.04)] lg:flex"
            >
              {signedOutLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-foreground/80 no-underline transition hover:bg-sage hover:text-forest"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

          {/* Right track */}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {signedIn ? (
              <>
                <span className="md:hidden">
                  <NavIconLink href="/search" label="Search" icon="search" />
                </span>
                <ThemeToggle />
                <span className="mx-1 hidden h-6 w-px bg-sand sm:block" aria-hidden />
                <NavIconLink
                  href="/notifications"
                  label="Notifications"
                  icon="bell"
                  badge={unread}
                />
                <NavIconLink
                  href="/messages"
                  label="Messages"
                  icon="messages"
                  badge={unreadMessages}
                />
                {isAdmin ? (
                  <span className="hidden lg:inline-flex">
                    <NavIconLink href="/admin/billing" label="Admin" icon="admin" />
                  </span>
                ) : null}
                <NavProfileLink href="/settings">
                  <Avatar
                    name={session!.user.name || session!.user.handle}
                    src={session!.user.image}
                    size="sm"
                  />
                </NavProfileLink>
                <form
                  className="hidden lg:block"
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <NavIconSubmit label="Sign out" icon="logout" />
                </form>
              </>
            ) : (
              <>
                <ThemeToggle />
                <Link
                  href="/login"
                  className="hidden rounded-full px-4 py-2 text-sm font-semibold text-foreground/80 no-underline transition hover:text-forest sm:inline-flex"
                >
                  Sign in
                </Link>
                <span className="hidden sm:inline-flex">
                  <CheckoutButton size="md" className="!h-11 !px-5" />
                </span>
              </>
            )}

            <NavMobileSheet
              signedIn={signedIn}
              isAdmin={isAdmin}
              links={
                signedIn
                  ? MEMBER_NAV_LINKS.map(({ href, label }) => ({ href, label }))
                  : signedOutLinks
              }
            />
          </div>
        </div>
      </div>
    </NavShell>
  );
}
