"use client";

import { Skeleton as HeroSkeleton } from "@heroui/react/skeleton";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <HeroSkeleton className={cn("rounded-ctl", className)} aria-hidden />
  );
}
