import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import { refreshViewerCrews } from "@/lib/crews/visit";
import { totalUnreadForUser } from "@/lib/messages/conversations";
import { AppHeader } from "@/components/app/app-header";
import { SideRail } from "@/components/app/side-rail";
import { MobileTabs } from "@/components/app/mobile-tabs";
import { NavDrawer } from "@/components/app/nav-drawer";
import { AnalyticsIdentity } from "@/components/analytics/identity";
import { FieldGlow } from "@/components/app/field-glow";

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
 * The rail remounted on every navigation, re-running its queries each time.
 * Worse, four routes have a `loading.tsx`, and a loading file replaces the
 * whole page subtree — so navigating to Courses, Members or a thread made the
 * sidebar and the header *disappear* until the data arrived, then snap back.
 * The chrome was being treated as page content, so it flickered like page
 * content.
 *
 * A layout is the thing React keeps mounted across navigations within its
 * segment. Moving the frame here makes the rail persistent by construction:
 * `loading.tsx` now replaces only the column beside it. `AppShell` stays, but
 * as a content wrapper — it still owns the max-width and the optional right
 * rail, which genuinely do differ per page, so every call site keeps the props
 * it already passed.
 *
 * The rail no longer lists spaces (DEC-078), so the only count it needs is
 * unread messages, loaded once here and handed to the header as well. The
 * per-space unread total that used to sit on "Spaces" is gone with it: it was
 * cleared by visiting a room, and members no longer visit rooms.
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

  const unreadMessages = await totalUnreadForUser(session.user.id).catch(() => 0);
  const staff = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN",
  );

  // The layout renders when a member arrives, not on every navigation: the
  // moment to read their survey answers if Kit has not been asked yet, so
  // their crews are there by the next page (lib/crews/visit.ts).
  const userId = session.user.id;
  after(() =>
    refreshViewerCrews(userId).then(
      () => undefined,
      (error: unknown) =>
        console.error(
          "[crews] visit refresh failed:",
          error instanceof Error ? error.message.slice(0, 200) : "unknown error",
        ),
    ),
  );

  const rail = <SideRail unread={{ "/messages": unreadMessages }} staff={staff} />;

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
        {rail}
      </aside>

      <div className="lg:pl-60">
        {/* Below `lg` the same rail opens as a drawer from the bar. */}
        <AppHeader menu={<NavDrawer>{rail}</NavDrawer>} unreadMessages={unreadMessages} />
        {children}
      </div>

      <MobileTabs />
      <AnalyticsIdentity userId={session.user.id} />
      <FieldGlow />
    </div>
  );
}
