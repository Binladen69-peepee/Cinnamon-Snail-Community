import type { LucideIcon } from "lucide-react";
import {
  Badge,
  ButtonLink,
  EmptyState,
  Field as AppField,
  buttonClass,
  fieldClass,
} from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * The bulletin board's kit, now a thin layer over the app's design system
 * (components/app/ui.tsx). The names stay so the three tabs read as one board
 * and keep compiling; what they paint comes from the shared parts.
 */

/**
 * One field look for an input, a select or a textarea. No fixed height, so a
 * textarea keeps its rows; a single-line control lands on the same 36px as
 * `Input`. Prefer `Input`, `Select` and `Textarea` from the app kit.
 */
export const fieldCls = fieldClass({ className: "h-auto min-h-9 py-1.5" });
export const labelCls = "mb-1.5 block text-label font-medium text-foreground";
export const primaryBtn = buttonClass({ variant: "primary" });
export const quietBtn = buttonClass({ variant: "secondary" });
export const linkBtn =
  "inline-flex w-fit cursor-pointer items-center gap-1.5 text-label font-medium text-link no-underline underline-offset-2 transition hover:underline [&_svg]:size-3.5 [&_svg]:shrink-0";
/** The row that opens a `<details>` form. The `<details>` itself is the card. */
export const summaryCls =
  "flex cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 py-3 text-body font-semibold text-foreground transition hover:bg-surface-muted group-open:rounded-b-none sm:px-5 [&::-webkit-details-marker]:hidden";

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AppField label={label} htmlFor={htmlFor} hint={hint} className={cn("min-w-0", className)}>
      {children}
    </AppField>
  );
}

export function Blank({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <EmptyState
      icon={<Icon />}
      title={title}
      description={body}
      action={action ? <ButtonLink href={action.href}>{action.label}</ButtonLink> : undefined}
    />
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "brand" }) {
  return <Badge tone={tone === "brand" ? "brand" : "neutral"}>{children}</Badge>;
}
