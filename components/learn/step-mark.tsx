import type { ReactNode } from "react";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The round marker at the start of a step: a lesson in a syllabus, a day in a
 * challenge.
 *
 * One construction for all of them, so "done" is the same mark everywhere.
 * It used to be `bg-brand` on lessons and `bg-brand-fill` on challenge days,
 * which only looked the same while the two tokens happened to agree. Done
 * takes the progress bar's colour; open and locked share a neutral disc and
 * differ by what is in it, so the state is never carried by colour alone.
 */
export function StepMark({
  state,
  size = "md",
  children,
  className,
}: {
  state: "done" | "open" | "locked";
  size?: "sm" | "md";
  /** What an open step shows: its kind's icon, or its day number. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full tabular-nums",
        size === "md"
          ? "size-7 text-caption font-semibold [&_svg]:size-3.5"
          : "size-6 text-micro font-semibold [&_svg]:size-3",
        state === "done" && "bg-brand text-on-brand",
        state === "open" && "bg-default text-foreground",
        state === "locked" && "bg-default text-foreground-muted",
        className,
      )}
      aria-hidden
    >
      {state === "done" ? <Check /> : state === "locked" ? <Lock /> : children}
    </span>
  );
}
