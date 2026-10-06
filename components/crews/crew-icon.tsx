import { CalendarDays, ClipboardList, Route, Users } from "lucide-react";
import type { CrewKindName } from "@/lib/crews/labels";
import { cn } from "@/lib/utils";

const ICONS = {
  COHORT: CalendarDays,
  ROADMAP: Route,
  TRAIT: ClipboardList,
  OPTIONAL: Users,
} as const;

/** The roundel that marks a crew, by how it gets its members. */
export function CrewIcon({
  kind,
  size = "md",
  className,
}: {
  kind: CrewKindName;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = ICONS[kind];
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash",
        size === "sm" && "size-9 [&_svg]:size-4",
        size === "md" && "size-10 [&_svg]:size-[1.125rem]",
        size === "lg" && "size-12 [&_svg]:size-5",
        className,
      )}
      aria-hidden
    >
      <Icon />
    </span>
  );
}
