"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The parts every auth screen shares.
 *
 * Sign in, register and the two reset screens are the same object at different
 * moments, so they are built from the same card, the same field and the same
 * submit button rather than four near-copies that drift apart. Everything
 * paints from role tokens, which is what makes the pair of themes work without
 * a single colour written here.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-6 text-center">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-muted">
          Vegan University
        </p>
        <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        <p className="mt-1.5 text-[14px] text-foreground-muted">{subtitle}</p>
      </div>
      <div className="vu-raise rounded-card border border-border bg-surface p-6">
        {children}
      </div>
      {footer ? (
        <div className="mt-4 text-center text-[12.5px] text-foreground-muted">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  value,
  onChange,
  trailing,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Present only on controlled fields, such as the email shared across tabs. */
  value?: string;
  onChange?: (value: string) => void;
  /** Rendered at the right of the label row, for a "forgot?" link. */
  trailing?: React.ReactNode;
}) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label
          htmlFor={id}
          className="block text-[12.5px] font-semibold text-foreground"
        >
          {label}
        </label>
        {trailing}
      </div>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...(onChange
          ? { value, onChange: (event) => onChange(event.target.value) }
          : {})}
        {...props}
        className={cn(
          "h-11 w-full rounded-ctl border bg-field-background px-3 text-[14.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:ring-2 disabled:opacity-60",
          error
            ? "border-danger focus:border-danger focus:ring-danger/25"
            : "border-field-border focus:border-brand focus:ring-brand/20",
        )}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12px] text-foreground-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-[12px] font-semibold text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Submit({
  pending,
  disabled,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled ?? pending}
      aria-busy={pending}
      className="vu-btn vu-btn-primary flex h-11 w-full items-center justify-center gap-2 text-[14px]"
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/**
 * The strength meter.
 *
 * Four segments rather than a number: the point is to show that a longer
 * password fills more of the bar, not to imply a precision the score does not
 * have. It never blocks submission, which the server does on its own rules.
 */
export function StrengthMeter({
  score,
  label,
  id,
}: {
  score: number;
  label: string;
  id: string;
}) {
  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              score >= step ? "bg-foreground" : "bg-border",
            )}
          />
        ))}
      </div>
      <p
        id={id}
        role="status"
        className="mt-1.5 text-[12px] text-foreground-muted"
      >
        Password strength: {label}
      </p>
    </div>
  );
}
