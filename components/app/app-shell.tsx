import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listNavSpaces } from "@/lib/spaces";
import { totalUnreadForUser } from "@/lib/messages/conversations";
import { LOOK_COOKIE, parseLook } from "@/lib/looks";
import { AppHeader } from "@/components/app/app-header";
import { SideRail } from "@/components/app/side-rail";
import { MobileTabs } from "@/components/app/mobile-tabs";
import { LookSwitcher } from "@/components/app/look-switcher";

/**
 * The member app frame.
 *
 * Reddit's three columns: a rail of destinations and communities, the content,
 * and a discovery rail the page fills in itself. The content column is capped
 * rather than elastic — a feed line that runs 1200px wide is unreadable, and
 * the extra width is better spent on the rails.
 *
 * The right rail is a slot rather than a fixed component, because what belongs
 * beside a page depends on the page: a space shows its About card, the feed
 * shows what to do next, and a settings screen wants nothing there at all.
 *
 * The candidate look is read here and stamped on this element, not on <html>:
 * the marketing site keeps its own identity and must never inherit the
 * attribute. Reading it on the server means no flash of the previous theme.
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
      data-look={look ?? undefined}
      className="min-h-screen bg-background text-foreground"
    >
      <AppHeader />

      <div className="mx-auto flex max-w-[1600px] gap-5 px-3 sm:px-4">
        {/* Sticks under the 56px bar and scrolls on its own, so a long list of
            spaces never pushes the destinations out of reach. */}
        <aside className="hidden w-[232px] shrink-0 lg:block">
          <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-4 pr-1">
            <SideRail
              favorites={nav.favorites}
              groups={nav.groups}
              unread={{
                "/messages": unreadMessages,
                "/spaces": nav.totalUnread,
              }}
            />
          </div>
        </aside>

        <main className="min-w-0 flex-1 py-4 pb-24 md:pb-4">
          {/* 720px: comfortable for a feed line at 15px, and the width Reddit
              settles on for its own content column. */}
          <div className="mx-auto w-full max-w-[720px]">{children}</div>
        </main>

        {rail ? (
          <aside className="hidden w-[300px] shrink-0 xl:block">
            <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-4">
              {rail}
            </div>
          </aside>
        ) : null}
      </div>

      <MobileTabs />
      <LookSwitcher current={look} />
    </div>
  );
}
