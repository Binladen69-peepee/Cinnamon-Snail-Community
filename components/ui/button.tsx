"use client";

import Link from "next/link";
import { Button as HeroButton, buttonVariants } from "@heroui/react/button";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

const variantMap = {
  primary: "primary",
  secondary: "outline",
  ghost: "ghost",
  danger: "danger",
} as const;

type HeroButtonProps = ComponentProps<typeof HeroButton>;

export type ButtonProps = Omit<HeroButtonProps, "variant" | "size" | "isDisabled"> & {
  variant?: keyof typeof variantMap;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  isDisabled?: boolean;
};

const pill = "rounded-full font-semibold tracking-tight";

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  disabled,
  isDisabled,
  ...props
}: ButtonProps) {
  return (
    <HeroButton
      type={type}
      variant={variantMap[variant]}
      size={size}
      isDisabled={isDisabled ?? disabled}
      className={cn(
        pill,
        variant === "primary" &&
          "!bg-foreground !text-primary-foreground hover:!opacity-90",
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof variantMap;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: variantMap[variant], size }),
        pill,
        "no-underline",
        variant === "primary" &&
          "!bg-foreground !text-primary-foreground hover:!opacity-90",
        className,
      )}
    >
      {children}
    </Link>
  );
}
