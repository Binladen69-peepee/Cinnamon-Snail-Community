import { MarketingFooter } from "@/components/layout/marketing-footer";
import { AppNav } from "@/components/layout/app-nav";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppNav />
      <div className="flex-1">{children}</div>
      <MarketingFooter />
    </div>
  );
}
