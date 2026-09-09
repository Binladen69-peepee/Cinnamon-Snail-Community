import { MarketingFooter } from "@/components/layout/marketing-footer";
import { AppNav } from "@/components/layout/app-nav";
import { BotanicalBackdrop } from "@/components/marketing/hero-decor";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <BotanicalBackdrop />
      <div className="relative z-10 flex min-h-screen flex-col">
        <AppNav />
        <div className="flex-1">{children}</div>
        <MarketingFooter />
      </div>
    </div>
  );
}
