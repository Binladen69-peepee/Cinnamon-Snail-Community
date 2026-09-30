import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listNavSpaces } from "@/lib/spaces";
import { totalUnreadForUser } from "@/lib/messages/conversations";
import { AppHeader } from "@/components/app/app-header";
import { SideRail } from "@/components/app/side-rail";
import { MobileTabs } from "@/components/app/mobile-tabs";
import { AnalyticsIdentity } from "@/components/analytics/identity";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * The member frame, and the reason it lives here rather than in each page.
 *
 * It used to be a pass-through: every page rendered `<AppShell>` itself, which
 * put the header, the rail and the mobile tabs inside the *page's* subtree.
 * Two things followed from that, and both were visible.
 *
 * The rail remounted on every navigation, re-running `listNavSpaces` and the
 * unread count each time. Worse, four routes have a `loading.tsx`, and a
 * loading file replaces the whole page subtree — so navigating to
 * Courses, Members or a thread made the sidebar and the header *disappear*
 * until the data arrived, then snap back. The chrome was being treated as page
 * content, so it flickered like page content.
 *
 * A layout is the thing React keeps mounted across navigations within its
 * segment. Moving the frame here makes the rail persistent by construction:
 * `loading.tsx` now replaces only the column beside it. `AppShell` stays, but
 * as a content wrapper — it still owns the max-width and the optional right
 * rail, which genuinely do differ per page, so every call site keeps the props
 * it already passed.
 *
 * The trade this makes: the header's notification count no longer refreshes on
 * every navigation, because the layout is no longer re-rendered on every
 * navigation. That is the same bargain `messages/layout.tsx` already makes to
 * keep the inbox's scroll position, and it is the one worth making.
 */
export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.sessionId) redirect("/login");

  const [nav, unreadMessages] = await Promise.all([
    listNavSpaces(session.user.id),
    totalUnreadForUser(session.user.id).catch(() => 0),
  ]);

  return (
    <div data-app-shell className="min-h-screen bg-background text-foreground">
      {/* Full height and above the header, so the rail reads as one panel
          running the side of the window rather than as something tucked under
          a bar. It carries the wordmark now, which is why it starts at the
          top. */}
      <aside
        aria-label="Destinations"
        className="vu-app-sidebar fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex"
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

      <div className="lg:pl-60">
        <AppHeader />
        {children}
      </div>

      <MobileTabs />
      <AnalyticsIdentity userId={session.user.id} />
    </div>
  );
}
