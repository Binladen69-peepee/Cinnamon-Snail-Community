import { AppNav } from "@/components/layout/app-nav";
import { MemberSidebar } from "@/components/layout/member-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export async function MemberShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.sessionId) redirect("/login");
  const spaces = await prisma.space.findMany({
    orderBy: { sortOrder: "asc" },
    select: { name: true, slug: true, coverUrl: true },
  });

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <AppNav />
      <div className="vu-gutter">
        <div className="vu-shell flex gap-6 py-8">
          <MemberSidebar spaces={spaces} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
