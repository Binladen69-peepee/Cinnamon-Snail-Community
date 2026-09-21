import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

/**
 * Admin gets its own chrome.
 *
 * It used to render inside the member shell, which meant moderation and billing
 * sat inside the same social furniture as the feed. The blueprint asks for
 * admin to be visually separate, and it is safer too: nothing here should look
 * like somewhere a mis-click belongs.
 *
 * The top band became a left rail to match the supplied course design, which is
 * built around one. Two links went with it -- Members and Moderation both
 * pointed at routes that do not exist and 404'd.
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        aria-label="Admin"
        className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-border bg-surface lg:block"
      >
        <AdminSidebar
          name={session.user.name || session.user.handle}
          role={
            session.user.roles.includes("SUPER_ADMIN")
              ? "Super admin"
              : "School admin"
          }
          avatarUrl={session.user.image ?? null}
        />
      </aside>

      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-[1120px] px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
