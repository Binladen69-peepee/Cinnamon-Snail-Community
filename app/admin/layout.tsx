import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signOutAction } from "@/app/(auth)/sign-out-action";
import { MEMBER_HOME_PATH } from "@/lib/auth/redirects";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { ADMIN_RAIL_COOKIE } from "@/lib/admin/nav";
import { countOpenReports } from "@/lib/admin/overview";
import { AnalyticsIdentity } from "@/components/analytics/identity";
import { FieldGlow } from "@/components/app/field-glow";

/**
 * The admin console.
 *
 * It follows the theme and shares the member app's design system (DEC-076):
 * the same palette and the same parts from components/app/ui.tsx. Every
 * component here paints from role tokens, so the whole console re-skins from
 * one place. Its frame follows the client's reference (DEC-088): a light rail
 * that collapses to its icons, a quiet top bar, white cards.
 *
 * Admin is deliberately not the member shell. Moderation and billing should not
 * sit inside the same furniture as the feed, and a surface that looks nothing
 * like the member app is a surface a mis-click cannot mistake for it.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const isStaff = session.user.roles.some(
    (role) => role === "ADMIN" || role === "SUPER_ADMIN",
  );
  if (!isStaff) redirect(MEMBER_HOME_PATH);

  // One cheap count, so the rail can say how much is waiting without every
  // page loading the moderation queue to find out.
  const [openReports, jar] = await Promise.all([countOpenReports(), cookies()]);
  const collapsed = jar.get(ADMIN_RAIL_COOKIE)?.value === "collapsed";

  const identity = {
    name: session.user.name || session.user.handle,
    role: session.user.roles.includes("SUPER_ADMIN")
      ? "Super admin"
      : "School admin",
    avatarUrl: session.user.image ?? null,
  };

  return (
    <div
      className="vu-admin min-h-screen bg-background text-foreground"
      data-rail={collapsed ? "collapsed" : "open"}
    >
      <aside
        aria-label="Admin"
        className="vu-admin-aside fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-background lg:block"
      >
        <AdminSidebar {...identity} badges={{ openReports }} signOutAction={signOutAction} />
      </aside>

      <AdminMobileNav {...identity} badges={{ openReports }} signOutAction={signOutAction} />

      <div className="vu-admin-main">
        {/* The rail carries navigation; this carries what is wanted from any
            page in the console — where you are, find a member, clear the
            queue, and the AI cohost. */}
        <AdminTopbar openReports={openReports} />
        <main className="mx-auto w-full max-w-360 px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8">
          {children}
        </main>
      </div>
      <AnalyticsIdentity userId={session.user.id} />
      <FieldGlow />
    </div>
  );
}
