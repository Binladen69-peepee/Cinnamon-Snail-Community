import { SearchX } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/app/ui";

/**
 * When a console page calls `notFound()`: a member, course or event that does
 * not exist. Rendered inside the console, so the rail is still there.
 */
export default function AdminNotFound() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="Nothing here"
      description="That record does not exist, or it was removed."
      action={
        <ButtonLink href="/admin" variant="primary">
          Back to the overview
        </ButtonLink>
      }
    />
  );
}
