import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listNavSpaces } from "@/lib/spaces";
import { totalUnreadForUser } from "@/lib/messages/conversations";
import { AppHeader } from "@/components/app/app-header";
import { SideRail } from "@/components/app/side-rail";
import { MobileTabs } from "@/components/app/mobile-tabs";
import { ThemeFab } from "@/components/app/theme-fab";
import { cn } from "@/lib/utils";

/**
 * Member frame: fixed left destinations, scrolling feed, optional discovery
 * rail. Theme is toggled from the account menu / FAB (not the top navbar).
 */
export async function AppShell({
  children,
  rail,
  wide = false,
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
  /** Profile and other multi-column pages need more than the feed column. */
  wide?: boolean;
}) {
  const session = await auth();
  if (!session?.sessionId) redirect("/login");

  const [nav, unreadMessages] = await Promise.all([
    listNavSpaces(session.user.id),
    totalUnreadForUser(session.user.id).catch(() => 0),
  ]);

  return (
    <div data-app-shell className="min-h-screen bg-background text-foreground">
      <AppHeader />

      <aside
        aria-label="Destinations"
        className="vu-app-sidebar fixed bottom-0 left-0 top-14 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex"
      >
        <SideRail
          favorites={nav.favorites}
          groups={nav.groups}
          unread={{
            "/messages": unreadMessages,
            "/spaces": nav.totalUnread,
          }}
        />
      </aside>

      <div className="lg:pl-64">
        <div
          className={cn(
            "mx-auto flex w-full",
            wide ? "max-w-[1200px]" : rail ? "max-w-[1400px]" : "max-w-[1100px]",
          )}
        >
          <main className="min-w-0 flex-1 px-3 py-5 pb-24 sm:px-6 md:pb-6">
            <div
              className={cn(
                "mx-auto w-full",
                wide ? "max-w-none" : "max-w-[680px]",
              )}
            >
              {children}
            </div>
          </main>

          {rail && !wide ? (
            <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[300px] shrink-0 overflow-y-auto py-5 pr-4 xl:block">
              {rail}
            </aside>
          ) : null}
        </div>
      </div>

      <MobileTabs />
      <ThemeFab />
    </div>
  );
}
