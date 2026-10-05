import type { ComponentProps, ReactNode } from "react";
import {
  Badge as AppBadge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ChipLink as AppChipLink,
  EmptyState,
  PageHeader as AppPageHeader,
  Stat as AppStat,
  Table as AppTable,
  Td as AppTd,
  Th as AppTh,
  Tr as AppTr,
  type BadgeTone,
} from "@/components/app/ui";

/**
 * The console's parts, as the console has always called them.
 *
 * They are thin names over the app's design system (components/app/ui.tsx),
 * so the console and the member app are built from the same pieces and
 * change together. The signatures are the ones twenty-two admin files
 * already use, which is why this file exists at all rather than each of
 * them importing the app parts directly.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return <AppPageHeader title={title} description={subtitle} actions={actions} back={back} />;
}

/** A surface. Callers give it padding, or put a `PanelHeader` at its top. */
export function Panel({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <Card padding="none" className={className} {...props}>
      {children}
    </Card>
  );
}

export function PanelHeader({
  title,
  icon,
  count,
  action,
}: {
  title: string;
  icon?: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return <CardHeader title={title} icon={icon} count={count} action={action} />;
}

export function Stat(props: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
  href?: string;
  flush?: boolean;
}) {
  return <AppStat {...props} />;
}

/** The console's historical tone names, mapped onto the system's. */
const TONE: Record<"neutral" | "good" | "warn" | "bad" | "solid", BadgeTone> = {
  neutral: "neutral",
  good: "success",
  warn: "warning",
  bad: "danger",
  solid: "solid",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof TONE | BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  const mapped = tone in TONE ? TONE[tone as keyof typeof TONE] : (tone as BadgeTone);
  return (
    <AppBadge tone={mapped} className={className}>
      {children}
    </AppBadge>
  );
}

export function AdminButton({
  variant = "secondary",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  return <Button variant={variant} {...props} />;
}

export function AdminLink({
  href,
  variant = "secondary",
  className,
  children,
}: {
  href: string;
  variant?: "primary" | "secondary";
  className?: string;
  children: ReactNode;
}) {
  return (
    <ButtonLink href={href} variant={variant} className={className}>
      {children}
    </ButtonLink>
  );
}

/** Filter and sort chips, as links so the state stays in the URL. */
export function ChipLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <AppChipLink href={href} active={active}>
      {children}
    </AppChipLink>
  );
}

/** The empty state inside a panel, so it carries no border of its own. */
export function EmptyPanel({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <EmptyState icon={icon} title={title} description={body} action={action} bordered={false} />
  );
}

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return <AppTable head={head}>{children}</AppTable>;
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <AppTh className={className}>{children}</AppTh>;
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <AppTd className={className}>{children}</AppTd>;
}

export function Tr({ children }: { children: ReactNode }) {
  return <AppTr>{children}</AppTr>;
}
