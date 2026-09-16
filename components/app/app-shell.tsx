import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listNavSpaces } from "@/lib/spaces";
import { totalUnreadForUser } from "@/lib/messages/conversations";
import { DARK_LOOK, LOOK_COOKIE, parseLook } from "@/lib/looks";
import { AppHeader } from "@/components/app/app-header";
import { SideRail } from "@/components/app/side-rail";
import { MobileTabs } from "@/components/app/mobile-tabs";
import { cn } from "@/lib/utils";
import { LookSwitcher } from "@/components/app/look-switcher";

/**
 * The member app frame.
 *
 * Three columns: a shadcn-style destination sidebar docked on the left, the
 * feed, and a discovery rail the page fills in. The sidebar is a real column
 * (full remaining viewport, own scroll) so it stays put while the feed moves.
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

  const [nav, unreadMessages, store] = await Promise.all([
    listNavSpaces(session.user.id),
    totalUnreadForUser(session.user.id).catch(() => 0),
    cookies(),
  ]);
  const look = parseLook(store.get(LOOK_COOKIE)?.value);

  return (
    <div
      data-look={look}
      className={cn(
        "min-h-screen bg-background text-foreground",
        look === DARK_LOOK && "dark",
      )}
    >
      <AppHeader />

      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
          <SideRail
            favorites={nav.favorites}
            groups={nav.groups}
            unread={{
              "/messages": unreadMessages,
              "/spaces": nav.totalUnread,
            }}
          />
        </aside>

        <main className="min-w-0 flex-1 px-3 py-4 pb-24 sm:px-5 md:pb-4">
          <div className="mx-auto w-full max-w-[720px]">{children}</div>
        </main>

        {rail ? (
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[320px] shrink-0 overflow-y-auto border-l border-border/60 px-4 py-4 xl:block">
            {rail}
          </aside>
        ) : null}
      </div>

      <MobileTabs />
      <LookSwitcher current={look} />
    </div>
  );
}
