import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listNavSpaces } from "@/lib/spaces";
import { totalUnreadForUser } from "@/lib/messages/conversations";
import { AppHeader } from "@/components/app/app-header";
import { SideRail } from "@/components/app/side-rail";
import { MobileTabs } from "@/components/app/mobile-tabs";
import { cn } from "@/lib/utils";

/**
 * Member frame: fixed left destinations, scrolling feed, optional discovery
 * rail. Theme comes from next-themes on <html> (system light/dark).
 */
export async function AppShell({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
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
            rail ? "max-w-[1400px]" : "max-w-[1100px]",
          )}
        >
          <main className="min-w-0 flex-1 px-3 py-5 pb-24 sm:px-6 md:pb-6">
            <div className="mx-auto w-full max-w-[680px]">{children}</div>
          </main>

          {rail ? (
            <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[300px] shrink-0 overflow-y-auto py-5 pr-4 xl:block">
              {rail}
            </aside>
          ) : null}
        </div>
      </div>

      <MobileTabs />
    </div>
  );
}
