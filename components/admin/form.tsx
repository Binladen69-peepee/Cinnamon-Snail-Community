"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Check, ChevronDown, Minus } from "lucide-react";
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
 * Everything paints from role tokens, so the always-dark scope styles it and
 * the same components would work on a light surface unchanged.
 */

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
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
      >
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {/* Error replaces help rather than stacking under it: two lines of
          guidance where one contradicts the other is how a form gets ignored. */}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-[12px] font-semibold text-danger"
        >
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="mt-1.5 text-[12px] text-foreground-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}

const FIELD_BASE =
  "w-full rounded-ctl border bg-field-background text-[13.5px] text-foreground outline-none transition placeholder:text-field-placeholder focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:opacity-50";

function fieldBorder(error?: string) {
  return error
    ? "border-danger focus:border-danger focus:ring-danger/25"
    : "border-field-border focus:border-brand";
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
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted">
            {prefix}
          </span>
        ) : null}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${fieldId}-error` : help ? `${fieldId}-help` : undefined
          }
          className={cn(
            FIELD_BASE,
            fieldBorder(error),
            "h-9 px-3",
            prefix && "pl-9",
            className,
          )}
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
        aria-describedby={
          error ? `${fieldId}-error` : help ? `${fieldId}-help` : undefined
        }
        className={cn(FIELD_BASE, fieldBorder(error), "resize-y px-3 py-2", className)}
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
      <div className="relative">
        <select
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${fieldId}-error` : help ? `${fieldId}-help` : undefined
          }
          className={cn(
            FIELD_BASE,
            fieldBorder(error),
            "h-9 appearance-none pl-3 pr-9",
            className,
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
          aria-hidden
        />
      </div>
    </Labelled>
  );
}

/**
 * A checkbox with a real input underneath.
 *
 * The box is drawn rather than styled, because `appearance: none` on a native
 * checkbox loses the indeterminate state and the focus ring. The input keeps
 * its semantics and its keyboard behaviour; only the paint is ours.
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
          props.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
      >
        <span className="relative mt-px grid size-[18px] shrink-0 place-items-center">
          <input
            id={fieldId}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error ? `${fieldId}-error` : help ? `${fieldId}-help` : undefined
            }
            className="peer size-[18px] cursor-pointer appearance-none rounded-chip border border-field-border bg-field-background transition checked:border-brand checked:bg-brand indeterminate:border-brand indeterminate:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed"
            ref={(node) => {
              if (node) node.indeterminate = indeterminate;
            }}
            {...props}
          />
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-on-brand opacity-0 transition peer-checked:opacity-100 peer-indeterminate:opacity-100">
            {indeterminate ? (
              <Minus className="size-3" strokeWidth={3} aria-hidden />
            ) : (
              <Check className="size-3" strokeWidth={3} aria-hidden />
            )}
          </span>
        </span>

        <span className="min-w-0">
          <span className="block text-[13.5px] text-foreground">{label}</span>
          {error ? (
            <span
              id={`${fieldId}-error`}
              role="alert"
              className="mt-0.5 block text-[12px] font-semibold text-danger"
            >
              {error}
            </span>
          ) : help ? (
            <span
              id={`${fieldId}-help`}
              className="mt-0.5 block text-[12px] text-foreground-muted"
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
        props.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <input
        id={fieldId}
        type="radio"
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] text-foreground">{label}</span>
        {help ? (
          <span className="mt-0.5 block text-[12px] text-foreground-muted">
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
        props.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-[13.5px] text-foreground">{label}</span>
        {help ? (
          <span className="mt-0.5 block text-[12px] text-foreground-muted">
            {help}
          </span>
        ) : null}
      </span>

      <span className="relative mt-0.5 shrink-0">
        <input
          id={fieldId}
          type="checkbox"
          role="switch"
          className="peer h-5 w-9 cursor-pointer appearance-none rounded-full border border-field-border bg-default transition checked:border-brand checked:bg-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed"
          {...props}
        />
        <span
          className="pointer-events-none absolute left-0.5 top-1/2 size-4 -translate-y-1/2 rounded-full bg-foreground transition-transform peer-checked:translate-x-4 peer-checked:bg-on-brand"
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
        "grid gap-4",
        columns === 2 && "sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
