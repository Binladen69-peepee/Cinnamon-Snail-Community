import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand/brand-mark";

/**
 * Admin gets its own chrome.
 *
 * It used to render inside the member shell, which meant moderation and billing
 * sat inside the same social furniture as the feed — a rail of spaces beside a
 * member-suspension screen. The blueprint asks for admin to be visually
 * separate, and it is safer too: nothing here should look like somewhere a
 * mis-click belongs.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

const ADMIN_LINKS = [
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/moderation", label: "Moderation" },
];

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
    <div className="min-h-screen bg-background">
      {/* Deliberately plainer than the member bar: a flat band, no search, no
          notifications. You are administering, not browsing. */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <BrandMark href="/home" />
          <span className="rounded-chip bg-danger/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-danger">
            Admin
          </span>
          <nav aria-label="Admin" className="ml-auto flex items-center gap-1">
            {ADMIN_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-ctl px-3 py-1.5 text-[13.5px] font-semibold text-foreground-muted no-underline transition hover:bg-mint hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/home"
              className="ml-2 rounded-ctl px-3 py-1.5 text-[13.5px] font-semibold text-brand no-underline transition hover:bg-brand-wash"
            >
              Back to the app
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
