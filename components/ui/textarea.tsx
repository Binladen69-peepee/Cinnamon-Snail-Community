"use client";

import { TextArea } from "@heroui/react/textarea";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type TextareaProps = ComponentProps<typeof TextArea>;

export function Textarea({
  className,
  variant = "secondary",
  fullWidth = true,
  ...props
}: TextareaProps) {
  return (
    <TextArea
      variant={variant}
      fullWidth={fullWidth}
      className={cn("min-h-32 font-sans", className)}
      {...props}
    />
  );
}
