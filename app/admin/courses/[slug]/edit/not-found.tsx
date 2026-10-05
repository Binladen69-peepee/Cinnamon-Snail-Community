import { GraduationCap } from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/app/ui";

/**
 * A course address that matches nothing: deleted, or mistyped. Shown inside the
 * console rather than as the framework's bare 404, with the way back.
 */
export default function CourseNotFound() {
  return (
    <EmptyState
      icon={<GraduationCap />}
      title="Course not found"
      description="It may have been deleted, or the link may be mistyped."
      action={<ButtonLink href="/admin/courses">Back to courses</ButtonLink>}
    />
  );
}
