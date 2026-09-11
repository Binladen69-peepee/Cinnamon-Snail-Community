import { AppNav } from "@/components/layout/app-nav";
import { MemberSidebar } from "@/components/layout/member-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { totalUnreadForUser } from "@/lib/messages/conversations";

export async function MemberShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.sessionId) redirect("/login");
  // Unread counts belong on the rail, not only on the app-bar icons: the
  // blueprint asks for state to be visible where the destination is.
  const [spaces, unreadMessages] = await Promise.all([
    prisma.space.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        name: true,
        slug: true,
        coverUrl: true,
        _count: { select: { memberships: true } },
      },
    }),
    totalUnreadForUser(session.user.id).catch(() => 0),
  ]);

  return (
    <div className="relative min-h-screen bg-transparent pb-24 md:pb-0">
      <AppNav />
      <div className="vu-gutter">
        <div className="vu-feed-shell flex gap-6 py-8">
          <MemberSidebar
            spaces={spaces.map((space) => ({
              name: space.name,
              slug: space.slug,
              coverUrl: space.coverUrl,
              memberCount: space._count.memberships,
            }))}
            unread={{ "/messages": unreadMessages }}
          />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
