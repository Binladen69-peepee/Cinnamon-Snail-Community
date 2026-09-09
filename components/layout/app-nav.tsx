import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { NavIconLink, NavIconSubmit, NavProfileLink } from "@/components/layout/nav-icon";
import { Search } from "lucide-react";
import { MEMBER_NAV_LINKS } from "@/lib/navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { NavMore } from "@/components/layout/nav-more";

const signedOutPrimary = [
  { href: "/membership", label: "Membership" },
  { href: "/courses", label: "Courses" },
];

const signedOutOverflow = [
  { href: "/community", label: "Community" },
  { href: "/about", label: "About" },
];

const linkClass =
  "shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-foreground hover:bg-sage hover:text-forest";

export async function AppNav() {
  const session = await auth().catch(() => null);
  const signedIn = Boolean(session?.sessionId);
  const homeHref = signedIn ? "/home" : "/";
  let unread = 0;
  if (signedIn && session?.user.id && process.env.DATABASE_URL) {
    try {
      unread = await prisma.notification.count({
        where: { userId: session.user.id, readAt: null },
      });
    } catch {
      unread = 0;
    }
  }
  const isAdmin = Boolean(
    session?.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN"),
  );

  return (
    <header className="sticky top-0 z-30 border-b border-sand bg-[rgba(255,255,255,0.94)] backdrop-blur-[18px] dark:border-[#122018] dark:bg-[rgba(0,2,1,0.94)]">
      <div className="vu-gutter">
        <div className="vu-feed-shell flex h-[74px] flex-nowrap items-center gap-3">
          <BrandMark href={homeHref} className="min-w-0 shrink-0" />

          {signedIn ? (
            <form action="/search" className="hidden min-w-0 flex-1 md:block">
              <label className="relative mx-auto flex max-w-sm items-center xl:max-w-md">
                <Search className="pointer-events-none absolute left-4 size-4 text-foreground-muted" aria-hidden />
                <span className="sr-only">Search Vegan University</span>
                <input
                  type="search"
                  name="q"
                  placeholder="Search Vegan University..."
                  className="h-11 w-full min-w-0 rounded-full border border-sand bg-warm-white pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-foreground-muted focus:border-accent"
                />
              </label>
            </form>
          ) : (
            <nav className="hidden min-w-0 flex-1 flex-nowrap items-center justify-center gap-0.5 lg:flex xl:gap-1">
              {signedOutPrimary.map((link) => (
                <Link key={link.href} href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              ))}
              {signedOutOverflow.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${linkClass} hidden xl:inline-flex`}
                >
                  {link.label}
                </Link>
              ))}
              <span className="xl:hidden">
                <NavMore items={signedOutOverflow} />
              </span>
            </nav>
          )}

          <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-0.5">
            {signedIn ? (
              <>
                <span className="md:hidden">
                  <NavIconLink href="/search" label="Search" icon="search" />
                </span>
                <ThemeToggle />
                <NavIconLink href="/notifications" label="Notifications" icon="bell" badge={unread} />
                <NavIconLink href="/messages" label="Messages" icon="messages" />
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
                <span className="min-[1440px]:hidden">
                  <NavIconLink href="/search" label="Search" icon="search" />
                </span>
                <form action="/search" className="relative mx-1 hidden w-52 shrink-0 min-[1440px]:block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
                  <span className="sr-only">Search Vegan University</span>
                  <input
                    type="search"
                    name="q"
                    placeholder="Search Vegan University..."
                    className="h-10 w-full rounded-full border border-sand bg-warm-white pl-9 pr-3 text-sm outline-none placeholder:text-foreground-muted focus:border-accent"
                  />
                </form>
                <ThemeToggle />
                <ButtonLink href="/login" size="sm" className="ml-1 shrink-0">
                  Sign in
                </ButtonLink>
              </>
            )}
            <details className="relative shrink-0 lg:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold text-foreground hover:bg-sage [&::-webkit-details-marker]:hidden">
                Menu
              </summary>
              <nav className="vu-card absolute right-0 top-[calc(100%+0.5rem)] z-50 flex w-56 flex-col gap-1 p-3 text-sm font-medium">
                {(signedIn ? MEMBER_NAV_LINKS : [...signedOutPrimary, ...signedOutOverflow]).map(
                  (link) => (
                    <Link key={link.href} href={link.href} className="rounded-full px-3 py-2 hover:bg-mint hover:text-forest">
                      {link.label}
                    </Link>
                  ),
                )}
                {signedIn ? (
                  <>
                    <Link href="/compose" className="rounded-full px-3 py-2 hover:bg-mint hover:text-forest">
                      Create post
                    </Link>
                    {isAdmin ? (
                      <Link href="/admin/billing" className="rounded-full px-3 py-2 hover:bg-mint hover:text-forest">
                        Admin
                      </Link>
                    ) : null}
                    <form
                      action={async () => {
                        "use server";
                        await signOut({ redirectTo: "/" });
                      }}
                    >
                      <button type="submit" className="w-full rounded-full px-3 py-2 text-left hover:bg-mint hover:text-forest">
                        Sign out
                      </button>
                    </form>
                  </>
                ) : (
                  <Link href="/login" className="rounded-full px-3 py-2 hover:bg-mint hover:text-forest">
                    Sign in
                  </Link>
                )}
              </nav>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}
