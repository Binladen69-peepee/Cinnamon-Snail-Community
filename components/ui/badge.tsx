"use client";

import { Chip } from "@heroui/react/chip";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Badge({
  children,
  className,
  color = "accent",
  size = "sm",
  variant = "soft",
  ...props
}: ComponentProps<typeof Chip>) {
  return (
    <Chip
      color={color}
      size={size}
      variant={variant}
      className={cn("font-sans", className)}
      {...props}
    >
      {typeof children === "string" || typeof children === "number" ? (
        <Chip.Label>{children}</Chip.Label>
      ) : (
        children
      )}
    </Chip>
  );
}
