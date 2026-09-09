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

const signedOutLinks = [
  { href: "/membership", label: "Membership" },
  { href: "/courses", label: "Courses" },
  { href: "/community", label: "Community" },
  { href: "/about", label: "About" },
];

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
    <header className="sticky top-0 z-30 border-b border-sand bg-[rgba(255,255,255,0.94)] backdrop-blur-[18px] dark:bg-[rgba(21,32,28,0.92)]">
      <div className="vu-gutter">
        <div className="vu-feed-shell flex h-[74px] items-center justify-between gap-3">
          <BrandMark href={homeHref} />
          {signedIn ? (
            <form action="/search" className="hidden min-w-0 flex-1 md:block">
              <label className="relative mx-auto flex max-w-xl items-center">
                <Search className="pointer-events-none absolute left-4 size-4 text-foreground-muted" aria-hidden />
                <span className="sr-only">Search Vegan University</span>
                <input
                  type="search"
                  name="q"
                  placeholder="Search Vegan University..."
                  className="h-11 w-full rounded-full border border-sand bg-warm-white pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-foreground-muted focus:border-accent"
                />
              </label>
            </form>
          ) : (
            <nav className="hidden min-w-0 flex-1 items-center justify-center gap-7 text-sm font-medium text-foreground lg:flex">
              {signedOutLinks.map((link) => (
                <Link key={link.href} href={link.href} className="whitespace-nowrap hover:text-forest">
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="flex shrink-0 items-center gap-0.5">
            {!signedIn ? (
              <form action="/search" className="relative mr-2 hidden w-56 lg:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
                <span className="sr-only">Search Vegan University</span>
                <input
                  type="search"
                  name="q"
                  placeholder="Search..."
                  className="h-10 w-full rounded-full border border-sand bg-warm-white pl-9 pr-3 text-sm outline-none placeholder:text-foreground-muted focus:border-accent"
                />
              </form>
            ) : null}
            <ThemeToggle />
            {signedIn ? (
              <>
                <span className="md:hidden">
                  <NavIconLink href="/search" label="Search" icon="search" />
                </span>
                <NavIconLink href="/notifications" label="Notifications" icon="bell" badge={unread} />
                <NavIconLink href="/messages" label="Messages" icon="messages" />
                <span className="hidden items-center gap-2 sm:inline-flex">
                  <NavProfileLink href="/settings">
                    <span className="flex items-center gap-2 pr-1">
                      <Avatar
                        name={session!.user.name || session!.user.handle}
                        src={session!.user.image}
                        size="sm"
                      />
                      <span className="hidden max-w-28 truncate text-sm font-semibold text-foreground lg:inline">
                        {session!.user.name || session!.user.handle}
                      </span>
                    </span>
                  </NavProfileLink>
                </span>
                {isAdmin ? (
                  <span className="hidden lg:inline-flex">
                    <NavIconLink href="/admin/billing" label="Admin" icon="admin" />
                  </span>
                ) : null}
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
              <ButtonLink href="/login" size="sm" className="ml-1">
                Sign in
              </ButtonLink>
            )}
            <details className="relative lg:hidden">
              <summary
                className="min-h-11 cursor-pointer list-none rounded-full px-3 py-2 text-sm font-semibold text-foreground hover:bg-sage [&::-webkit-details-marker]:hidden"
              >
                Menu
              </summary>
              <nav className="vu-card absolute right-0 top-[calc(100%+0.5rem)] z-40 flex w-56 flex-col gap-3 p-4 text-sm font-medium text-foreground">
                {(signedIn ? MEMBER_NAV_LINKS : signedOutLinks).map((link) => (
                  <Link key={link.href} href={link.href} className="hover:text-forest">
                    {link.label}
                  </Link>
                ))}
                {signedIn ? (
                  <>
                    <Link href="/search" className="md:hidden">
                      Search
                    </Link>
                    <Link href="/compose">Create post</Link>
                    <Link href="/settings" className="sm:hidden">
                      Profile
                    </Link>
                    {isAdmin ? (
                      <Link href="/admin/billing" className="lg:hidden">
                        Admin
                      </Link>
                    ) : null}
                    <form
                      action={async () => {
                        "use server";
                        await signOut({ redirectTo: "/" });
                      }}
                    >
                      <button type="submit" className="text-left hover:text-forest">
                        Sign out
                      </button>
                    </form>
                  </>
                ) : (
                  <Link href="/login">Sign in</Link>
                )}
              </nav>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}
