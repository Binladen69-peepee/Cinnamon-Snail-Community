"use client";

import { Input as HeroInput } from "@heroui/react/input";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type InputProps = ComponentProps<typeof HeroInput>;

export function Input({ className, variant = "secondary", fullWidth = true, ...props }: InputProps) {
  return (
    <HeroInput
      variant={variant}
      fullWidth={fullWidth}
      className={cn("font-sans", className)}
      {...props}
    />
  );
}
