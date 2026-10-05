"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { Field, fieldClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * The console's form controls.
 *
 * Modelled on Polaris's component API — a labelled control with optional help
 * text and an error that replaces it, rather than a bare input the caller has
 * to decorate — because that shape is the genuinely good part of Polaris and it
 * is what makes a form screen consistent.
 *
 * Built here rather than installed: `@shopify/polaris` is deprecated by
 * Shopify, unmaintained, and peer-locked to React 18 while this app runs 19.
 * Its successor is a set of web components meant to be embedded in Shopify
 * Admin, not used in a standalone app.
 *
 * The look is the app's: `Field` lays out the label, help and error, and
 * `fieldClass` draws the control, so a console form and a member-app form are
 * the same form. Everything paints from role tokens, in light and dark alike.
 */

/** Ids on the help and error lines, so the control can point at them. */
function describedBy(id: string, help?: string, error?: string) {
  return error ? `${id}-error` : help ? `${id}-help` : undefined;
}

function Labelled({
  id,
  label,
  help,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  // Error replaces help rather than stacking under it: two lines of guidance
  // where one contradicts the other is how a form gets ignored. `Field` does
  // exactly that; the spans carry the ids the control's aria-describedby uses.
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      className="min-w-0"
      hint={help ? <span id={`${id}-help`}>{help}</span> : undefined}
      error={error ? <span id={`${id}-error`}>{error}</span> : undefined}
    >
      {children}
    </Field>
  );
}

export function TextField({
  label,
  help,
  error,
  prefix,
  className,
  id,
  ...props
}: Omit<ComponentProps<"input">, "prefix"> & {
  label: string;
  help?: string;
  error?: string;
  prefix?: ReactNode;
}) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <Labelled
      id={fieldId}
      label={label}
      help={help}
      error={error}
      required={props.required}
    >
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted [&_svg]:size-4">
            {prefix}
          </span>
        ) : null}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, help, error)}
          className={fieldClass({ className: cn(prefix && "pl-9", className) })}
          {...props}
        />
      </div>
    </Labelled>
  );
}

export function TextArea({
  label,
  help,
  error,
  className,
  id,
  rows = 4,
  ...props
}: ComponentProps<"textarea"> & {
  label: string;
  help?: string;
  error?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <Labelled
      id={fieldId}
      label={label}
      help={help}
      error={error}
      required={props.required}
    >
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, help, error)}
        className={fieldClass({ multiline: true, className: cn("resize-y", className) })}
        {...props}
      />
    </Labelled>
  );
}

export function Select({
  label,
  help,
  error,
  options,
  className,
  id,
  ...props
}: Omit<ComponentProps<"select">, "children"> & {
  label: string;
  help?: string;
  error?: string;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <Labelled
      id={fieldId}
      label={label}
      help={help}
      error={error}
      required={props.required}
    >
      {/* `vu-select` replaces the system chevron with one that matches the
          inputs beside it. */}
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, help, error)}
        className={fieldClass({ className: cn("vu-select pr-8", className) })}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </Labelled>
  );
}

/**
 * A checkbox with a real input underneath.
 *
 * The box is drawn rather than styled, because `appearance: none` on a native
 * checkbox loses the indeterminate state. The input keeps its semantics, its
 * keyboard behaviour and the app's focus ring; only the paint is ours.
 */
export function Checkbox({
  label,
  help,
  error,
  indeterminate = false,
  className,
  id,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  label: string;
  help?: string;
  error?: string;
  indeterminate?: boolean;
}) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <div className={cn("min-w-0", className)}>
      <label
        htmlFor={fieldId}
        className={cn(
          "group flex items-start gap-2.5",
          props.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        )}
      >
        <span className="relative mt-0.5 grid size-4.5 shrink-0 place-items-center">
          <input
            id={fieldId}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(fieldId, help, error)}
            className="peer size-4.5 cursor-pointer appearance-none rounded-chip border border-field-border bg-field-background transition checked:border-brand-fill checked:bg-brand-fill indeterminate:border-brand-fill indeterminate:bg-brand-fill aria-invalid:border-danger disabled:cursor-not-allowed"
            ref={(node) => {
              if (node) node.indeterminate = indeterminate;
            }}
            {...props}
          />
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-brand-fill-foreground opacity-0 transition peer-checked:opacity-100 peer-indeterminate:opacity-100">
            {indeterminate ? (
              <Minus className="size-3" strokeWidth={3} aria-hidden />
            ) : (
              <Check className="size-3" strokeWidth={3} aria-hidden />
            )}
          </span>
        </span>

        <span className="min-w-0">
          <span className="block text-body text-foreground">{label}</span>
          {error ? (
            <span
              id={`${fieldId}-error`}
              role="alert"
              className="mt-0.5 block text-caption font-medium text-danger"
            >
              {error}
            </span>
          ) : help ? (
            <span
              id={`${fieldId}-help`}
              className="mt-0.5 block text-caption text-foreground-muted"
            >
              {help}
            </span>
          ) : null}
        </span>
      </label>
    </div>
  );
}

export function RadioField({
  label,
  help,
  className,
  id,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  label: string;
  help?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <label
      htmlFor={fieldId}
      className={cn(
        "flex items-start gap-2.5",
        props.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      {/* The native radio takes the brand fill from the console's
          accent-color rule in globals.css. */}
      <input
        id={fieldId}
        type="radio"
        className="mt-0.5 size-4 shrink-0 cursor-pointer"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-body text-foreground">{label}</span>
        {help ? (
          <span className="mt-0.5 block text-caption text-foreground-muted">
            {help}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/** A switch. Same semantics as a checkbox; the affordance says "takes effect now". */
export function Toggle({
  label,
  help,
  id,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  label: string;
  help?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <label
      htmlFor={fieldId}
      className={cn(
        "flex items-start justify-between gap-4",
        props.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-body text-foreground">{label}</span>
        {help ? (
          <span className="mt-0.5 block text-caption text-foreground-muted">
            {help}
          </span>
        ) : null}
      </span>

      <span className="relative mt-0.5 shrink-0">
        <input
          id={fieldId}
          type="checkbox"
          role="switch"
          className="peer block h-5 w-9 cursor-pointer appearance-none rounded-full border border-field-border bg-default transition checked:border-brand-fill checked:bg-brand-fill disabled:cursor-not-allowed"
          {...props}
        />
        <span
          className="pointer-events-none absolute left-0.5 top-1/2 size-4 -translate-y-1/2 rounded-full bg-foreground-muted shadow-e1 transition-transform peer-checked:translate-x-4 peer-checked:bg-brand-fill-foreground"
          aria-hidden
        />
      </span>
    </label>
  );
}

/** Stacks fields with one rhythm, so no screen invents its own spacing. */
export function FormLayout({
  columns = 1,
  className,
  children,
}: {
  columns?: 1 | 2;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        columns === 2 && "sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
