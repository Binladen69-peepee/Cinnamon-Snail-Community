import { Compass } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { ButtonLink, EmptyState } from "@/components/app/ui";

/**
 * When a member page calls `notFound()`: a post that was deleted, a space or
 * a profile that does not exist. Rendered inside the member frame, so the way
 * back is right there, rather than on Next's bare default page.
 */
export default function MemberNotFound() {
  return (
    <AppShell>
      <EmptyState
        icon={<Compass />}
        title="We could not find that"
        description="It may have been removed, or the link may be wrong."
        action={
          <>
            <ButtonLink href="/home" variant="primary">
              Back to Explorer
            </ButtonLink>
            <ButtonLink href="/search">Search</ButtonLink>
          </>
        }
      />
    </AppShell>
  );
}
