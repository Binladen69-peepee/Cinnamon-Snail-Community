import { MemberShell } from "@/components/layout/member-shell";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const roles = session?.user.roles ?? [];
  if (!roles.includes("ADMIN") && !roles.includes("SUPER_ADMIN")) {
    redirect("/home");
  }
  return <MemberShell>{children}</MemberShell>;
}
