"use client";

import { Card as HeroCard } from "@heroui/react/card";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type CardProps = ComponentProps<typeof HeroCard>;

export function Card({ className, variant = "default", ...props }: CardProps) {
  return (
    <HeroCard
      variant={variant}
      className={cn(
        "overflow-hidden rounded-[1.5rem] border-0 bg-surface shadow-[0_10px_40px_rgba(26,26,26,0.06)]",
        className,
      )}
      {...props}
    />
  );
}
