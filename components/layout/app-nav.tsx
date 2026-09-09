import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { NavIconLink, NavIconSubmit, NavProfileLink } from "@/components/layout/nav-icon";
import { Search } from "lucide-react";
import { MEMBER_NAV_LINKS } from "@/lib/navigation";

const signedOutLinks = [
  { href: "/membership", label: "Membership" },
  { href: "/courses", label: "Courses" },
  { href: "/community", label: "Community" },
  { href: "/about", label: "About" },
];

export async function AppNav() {
  const session = await auth();
  const signedIn = Boolean(session?.sessionId);
  const homeHref = signedIn ? "/home" : "/";
  const unread =
    signedIn && session?.user.id
      ? await prisma.notification.count({
          where: { userId: session.user.id, readAt: null },
        })
      : 0;
  const isAdmin = Boolean(
    session?.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN"),
  );

  return (
    <header className="vu-gutter sticky top-0 z-30 pt-4">
      <div className="vu-card vu-shell relative flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
        <Link href={homeHref} className="shrink-0 text-base font-extrabold tracking-tight text-foreground sm:text-lg">
          Vegan University
        </Link>
        {signedIn ? (
          <form action="/search" className="hidden min-w-0 flex-1 md:block">
            <label className="relative mx-auto flex max-w-xl items-center">
              <Search className="pointer-events-none absolute left-3 size-4 text-foreground-muted" aria-hidden />
              <span className="sr-only">Search</span>
              <input
                type="search"
                name="q"
                placeholder="Search Vegan University"
                className="h-10 w-full border border-border bg-background pl-9 pr-4 text-sm text-foreground outline-none placeholder:text-foreground-muted focus:border-accent"
                style={{ borderRadius: 12 }}
              />
            </label>
          </form>
        ) : (
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-5 text-xs font-bold uppercase tracking-[0.14em] text-foreground lg:flex">
            {signedOutLinks.map((link) => (
              <Link key={link.href} href={link.href} className="whitespace-nowrap hover:text-accent">
                {link.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeToggle />
          {signedIn ? (
            <>
              <span className="md:hidden">
                <NavIconLink href="/search" label="Search" icon="search" />
              </span>
              <NavIconLink href="/compose" label="Create post" icon="create" />
              <NavIconLink href="/notifications" label="Notifications" icon="bell" badge={unread} />
              <span className="hidden sm:inline-flex">
                <NavProfileLink href="/settings">
                  <Avatar
                    name={session!.user.name || session!.user.handle}
                    src={session!.user.image}
                    size="sm"
                  />
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
            <>
              <Link href="/login" className="hidden text-sm font-medium text-foreground sm:inline">
                Sign in
              </Link>
              <ButtonLink href="/membership" size="sm">
                Join
              </ButtonLink>
            </>
          )}
          <details className={signedIn ? "relative lg:hidden" : "relative lg:hidden"}>
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-foreground hover:bg-background [&::-webkit-details-marker]:hidden" style={{ borderRadius: 12 }}>
              Menu
            </summary>
            <nav className="vu-card absolute right-0 top-[calc(100%+0.5rem)] z-40 flex w-56 flex-col gap-3 p-4 text-sm font-medium text-foreground">
              {(signedIn ? MEMBER_NAV_LINKS : signedOutLinks).map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-accent">
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
                    <button type="submit" className="text-left hover:text-accent">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="sm:hidden">
                  Sign in
                </Link>
              )}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
