import { AppNav } from "@/components/layout/app-nav";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-transparent">
      <AppNav />
      {/* Centred in the viewport rather than pinned under the nav: the form is
          short, and a sign-in screen reads as a doorway when it sits in the
          middle of the page. */}
      <div className="vu-gutter flex min-h-[calc(100vh-3.5rem)] items-center justify-center py-12">
        {children}
      </div>
    </div>
  );
}
