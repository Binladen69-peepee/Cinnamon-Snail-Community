import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The console's shared parts.
 *
 * Six pages were each inventing their own panel, heading and pill, which is how
 * an admin area ends up looking like six admin areas. Everything here paints
 * from role tokens, so the always-dark scope in `globals.css` re-skins all of
 * it without a single colour being named twice.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h1 className="font-display text-[1.55rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-[13.5px] text-foreground-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A raised surface. `vu-raise` adds the lit top edge that stands in for shadow. */
export function Panel({
  className,
  children,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "vu-raise rounded-card border border-border bg-surface",
        className,
      )}
      {...props}
    >
      {children}
    </section>
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
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-foreground">
        {icon ? <span className="text-foreground-muted">{icon}</span> : null}
        {title}
        {count !== undefined ? (
          <span className="text-[12px] font-semibold tabular-nums text-foreground-muted">
            {count}
          </span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}

/**
 * A metric.
 *
 * `hint` carries the comparison, never a made-up trend: a percentage with no
 * period behind it is decoration. Callers pass what they actually measured.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  href,
  flush = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
  href?: string;
  /** Inside a panel the dividers come from the grid, not from each tile. */
  flush?: boolean;
}) {
  const body = (
    <>
      <dt className="text-[12px] font-semibold text-foreground-muted">{label}</dt>
      <dd
        className={cn(
          "mt-1.5 font-display text-[1.75rem] font-bold leading-none tabular-nums",
          tone === "good" && "text-brand",
          tone === "warn" && "text-warning",
          tone === "bad" && "text-danger",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </dd>
      {hint ? (
        <p className="mt-1.5 text-[11.5px] text-foreground-muted">{hint}</p>
      ) : null}
    </>
  );

  const className = flush
    ? "block bg-surface p-4 transition"
    : "vu-raise block rounded-card border border-border bg-surface p-4 transition";

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          className,
          "no-underline",
          flush ? "hover:bg-default" : "hover:border-hairline-firm",
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

const BADGE_TONES = {
  neutral: "bg-default text-foreground-muted",
  good: "bg-brand-wash text-brand-strong",
  warn: "bg-warning/15 text-warning",
  bad: "bg-danger/15 text-danger",
  solid: "bg-brand-fill text-brand-fill-foreground",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-chip px-2 py-0.5 text-[11px] font-bold",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AdminButton({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  return (
    <button
      className={cn(
        "vu-btn inline-flex h-9 items-center justify-center gap-1.5 px-3.5 text-[13px]",
        variant === "primary" && "vu-btn-primary",
        variant === "secondary" && "vu-btn-secondary",
        variant === "danger" &&
          "vu-btn-secondary text-danger hover:text-danger",
        className,
      )}
      {...props}
    />
  );
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
    <Link
      href={href}
      className={cn(
        "vu-btn inline-flex h-9 items-center justify-center gap-1.5 px-3.5 text-[13px] no-underline",
        variant === "primary" ? "vu-btn-primary" : "vu-btn-secondary",
        className,
      )}
    >
      {children}
    </Link>
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
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-8 items-center whitespace-nowrap rounded-ctl border px-3 text-[12.5px] font-semibold no-underline transition",
        active
          ? "border-brand-fill bg-brand-fill text-brand-fill-foreground"
          : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

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
    <div className="px-6 py-14 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-wash text-brand-strong">
        {icon}
      </span>
      <h3 className="mt-3 font-display text-[1.05rem] font-bold text-foreground">
        {title}
      </h3>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] text-foreground-muted">
        {body}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Table shell. Rows stay hairline-separated so long lists read as a ledger. */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="border-b border-border">
          <tr className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("px-4 py-2.5 font-bold", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

export function Tr({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-separator transition last:border-b-0 hover:bg-default/50">
      {children}
    </tr>
  );
}
