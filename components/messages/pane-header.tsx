import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * The bar across the top of each messages pane: the inbox, a thread, the
 * new-message picker, and the skeletons that stand in for them.
 *
 * One fixed height for all of them, so the separator under the inbox header
 * and the one under the thread header meet in a single line across the split
 * rather than stepping by a few pixels.
 */
export const paneHeaderClass =
  "flex h-15 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 sm:px-4";

export function PaneHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <header className={cn(paneHeaderClass, className)}>{children}</header>;
}

/** Back to the inbox. Phones only: from `lg` the inbox is already beside it. */
export function PaneBackLink() {
  return (
    <Link
      href="/messages"
      aria-label="Back to conversations"
      className={buttonClass({
        variant: "ghost",
        size: "sm",
        iconOnly: true,
        className: "-ml-1 lg:hidden",
      })}
    >
      <ArrowLeft className="size-[1.125rem]" aria-hidden />
    </Link>
  );
}
