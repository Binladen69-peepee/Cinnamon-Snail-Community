import { Shapes } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/app/ui";

/** A category that was deleted, or a link that was mistyped. */
export default function CourseCategoryNotFound() {
  return (
    <EmptyState
      icon={<Shapes />}
      title="That category does not exist"
      description="It may have been deleted. Its classes are still in the library."
      action={<ButtonLink href="/admin/courses/categories">All categories</ButtonLink>}
    />
  );
}
