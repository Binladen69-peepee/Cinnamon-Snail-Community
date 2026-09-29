import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared look for the bulletin board's forms, so three tabs read as one board. */
export const fieldCls =
  "w-full rounded-ctl border border-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-foreground-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";
export const labelCls = "mb-1 block text-[12.5px] font-semibold text-foreground";
export const primaryBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-ctl bg-brand-fill px-3.5 text-[13.5px] font-semibold text-brand-fill-foreground no-underline transition hover:opacity-90";
export const quietBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-ctl border border-border bg-background px-3.5 text-[13.5px] font-semibold text-foreground no-underline transition hover:border-hairline-firm";
export const linkBtn =
  "inline-flex items-center gap-1 text-[12.5px] font-semibold text-foreground-muted underline-offset-2 hover:text-foreground hover:underline";
export const summaryCls =
  "flex cursor-pointer list-none items-center justify-between gap-2 rounded-card border border-border bg-surface px-4 py-3 text-[14px] font-semibold text-foreground transition hover:border-hairline-firm [&::-webkit-details-marker]:hidden";

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
    <div className={className}>
      <label htmlFor={htmlFor} className={labelCls}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[12px] text-foreground-muted">{hint}</p> : null}
    </div>
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
    <div className="rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-full bg-brand-wash text-on-brand-wash">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="mt-3 font-display text-[1.05rem] font-bold text-foreground">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-[48ch] text-[13.5px] text-foreground-muted">{body}</p>
      {action ? (
        <Link href={action.href} className={cn(quietBtn, "mt-4")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "brand" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]",
        tone === "brand" ? "bg-brand-wash text-on-brand-wash" : "bg-surface-muted text-foreground-muted",
      )}
    >
      {children}
    </span>
  );
}
