import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { countOpenReports } from "@/lib/admin/overview";

/**
 * The admin console.
 *
 * Monochrome, and it follows the theme: pure white in light, pure black in
 * dark. `.vu-admin` tightens the console's surfaces a step past the member
 * app's -- denser borders, a flatter elevation ladder -- without introducing a
 * second palette. Every component here paints from role tokens, so the whole
 * console re-skins from that one scope.
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
  if (!isStaff) redirect("/home");

  // One cheap count, so the rail can say how much is waiting without every
  // page loading the moderation queue to find out.
  const openReports = await countOpenReports();

  const identity = {
    name: session.user.name || session.user.handle,
    role: session.user.roles.includes("SUPER_ADMIN")
      ? "Super admin"
      : "School admin",
    avatarUrl: session.user.image ?? null,
  };

  return (
    <div className="vu-admin min-h-screen bg-background text-foreground">
      <aside
        aria-label="Admin"
        className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-sidebar-border bg-sidebar lg:block"
      >
        <AdminSidebar {...identity} badges={{ openReports }} />
      </aside>

      <AdminMobileNav {...identity} />

      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-4 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
