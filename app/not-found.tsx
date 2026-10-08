import { Compass } from "lucide-react";
import { AppNav } from "@/components/layout/app-nav";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { ButtonLink, EmptyState } from "@/components/app/ui";

export const metadata = { title: "Page not found" };

/**
 * An address that matches nothing at all. Inside the site's own frame, so a
 * visitor who followed an old link still has the navigation and a way home,
 * rather than Next's bare default page. Member and admin pages that call
 * `notFound()` have their own, inside their own frames.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col bg-transparent">
      <AppNav />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-20">
        <EmptyState
          icon={<Compass />}
          title="We could not find that page"
          description="The link may be old, or the page may have moved."
          action={
            <>
              <ButtonLink href="/" variant="primary">
                Go to the home page
              </ButtonLink>
              <ButtonLink href="/membership">See the membership</ButtonLink>
            </>
          }
        />
      </main>
      <MarketingFooter />
    </div>
  );
}
