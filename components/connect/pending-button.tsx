"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A submit button that knows its form is in flight.
 *
 * The match buttons are plain form actions, so they work before hydration.
 * Once hydrated, this disables the button while the action runs, which stops
 * a double tap from writing twice and shows that something is happening.
 */
export function PendingButton({
  children,
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn(className, "disabled:cursor-wait disabled:opacity-60")}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
