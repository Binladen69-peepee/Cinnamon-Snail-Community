import { AppNav } from "@/components/layout/app-nav";
import { MemberSidebar } from "@/components/layout/member-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { totalUnreadForUser } from "@/lib/messages/conversations";
import { listNavSpaces } from "@/lib/spaces";

export async function MemberShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.sessionId) redirect("/login");
  // Unread counts belong on the rail, not only on the app-bar icons: the
  // blueprint asks for state to be visible where the destination is.
  const [nav, unreadMessages] = await Promise.all([
    listNavSpaces(session.user.id),
    totalUnreadForUser(session.user.id).catch(() => 0),
  ]);

  return (
    <div className="relative min-h-screen bg-transparent pb-24 md:pb-0">
      <AppNav />
      <div className="vu-gutter">
        <div className="vu-feed-shell flex gap-6 py-8">
          <MemberSidebar
            favorites={nav.favorites}
            spaceGroups={nav.groups}
            unread={{ "/messages": unreadMessages, "/spaces": nav.totalUnread }}
          />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
