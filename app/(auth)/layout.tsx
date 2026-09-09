import { AppNav } from "@/components/layout/app-nav";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-transparent">
      <AppNav />
      <div className="vu-gutter flex items-center justify-center py-16">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
