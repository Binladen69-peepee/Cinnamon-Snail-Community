"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * The small square buttons at the end of a console row: move up, move down,
 * rename, delete. Ghost until hovered, labelled for screen readers and with a
 * tooltip for everyone else, and a delete only turns red under the pointer, so
 * a list of rows does not read as a list of alarms. The curriculum editor's
 * rows use the same construction.
 */
export function RowIconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "[&_svg]:size-4",
        danger && "[&:hover:not(:disabled)_svg]:text-danger",
      )}
    >
      {children}
    </Button>
  );
}
