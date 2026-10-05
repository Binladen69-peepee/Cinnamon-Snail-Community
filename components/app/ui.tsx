import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The app's design system: one set of parts for the member app and the admin
 * console. See DEC-076.
 *
 * Before this, the signed-in pages had four button systems, a dozen empty
 * states, fourteen kinds of filter chip and thirty-five font sizes, because
 * each page invented what it needed. Everything here paints from the role
 * tokens in `app/globals.css` ("App design system"), so light and dark,
 * member and admin, all come from one place. Nothing here is a client
 * component, so it renders on the server and is just as usable from one.
 *
 * Type scale (globals.css `--text-*`): micro 11, caption 12, label 13,
 * body 14, reading 15, title 16, heading 19, display 24.
 */

/* ------------------------------------------------------------------------ */
/* Page structure                                                           */
/* ------------------------------------------------------------------------ */

/** Small uppercase label above a title or a group. */
export function Overline({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * The top of every page: an optional way back, the title, one line saying what
 * the page is for, and the page's actions.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  back,
  actions,
  tone = "default",
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  /**
   * `hero` sets the header in the teal band. For a section's front page (the
   * overview, the catalogue), not for every page: a band on every screen
   * stops meaning anything.
   */
  tone?: "default" | "hero";
  className?: string;
  /** Rendered under the title row: tabs, filters, a summary. */
  children?: ReactNode;
}) {
  const hero = tone === "hero";
  return (
    <header
      className={cn(
        "flex flex-col gap-4",
        hero && "vu-band relative overflow-hidden rounded-card px-5 py-7 shadow-e2 sm:px-8 sm:py-9",
        className,
      )}
    >
      {back ? (
        <Link
          href={back.href}
          className="-ml-1 inline-flex w-fit items-center gap-1 rounded-ctl px-1 text-label font-medium text-foreground-muted no-underline transition hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          {eyebrow ? (
            <div
              className={cn(
                "mb-1.5 text-micro font-semibold uppercase tracking-[0.08em]",
                hero ? "text-foreground-muted" : "text-brand-strong",
              )}
            >
              {eyebrow}
            </div>
          ) : null}
          <h1
            className={cn(
              "font-bold tracking-[-0.025em] text-foreground text-balance",
              hero ? "text-[2rem] leading-[2.375rem] sm:text-[2.5rem] sm:leading-[2.875rem]" : "text-display",
            )}
          >
            {title}
          </h1>

          {description ? (
            <p
              className={cn(
                "max-w-[64ch] text-foreground-muted text-pretty",
                hero ? "mt-3 text-reading" : "mt-1.5 text-body",
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

/** A heading for a block of content within a page. */
export function SectionHeader({
  title,
  description,
  icon,
  count,
  action,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  count?: number;
  action?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <Heading className="flex items-center gap-2 text-title font-semibold text-foreground">
          {icon ? (
            <span className="text-foreground-muted [&_svg]:size-4" aria-hidden>
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{title}</span>
          {count !== undefined ? (
            <span className="text-label font-medium tabular-nums text-foreground-muted">
              {count}
            </span>
          ) : null}
        </Heading>
        {description ? (
          <p className="mt-0.5 text-label text-foreground-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** A page section: its header and its content, at the standard rhythm. */
export function Section({
  title,
  description,
  icon,
  count,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  count?: number;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {title ? (
        <SectionHeader
          title={title}
          description={description}
          icon={icon}
          count={count}
          action={action}
        />
      ) : null}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Surfaces                                                                 */
/* ------------------------------------------------------------------------ */

const CARD_PADDING = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
} as const;

/** The card: a white surface on the ground, a hairline edge, no ornament. */
export function cardClass({
  padding = "md",
  interactive = false,
  className,
}: {
  padding?: keyof typeof CARD_PADDING;
  interactive?: boolean;
  className?: string;
} = {}) {
  return cn(
    "rounded-card border border-border bg-surface shadow-e1",
    CARD_PADDING[padding],
    interactive &&
      "transition hover:border-hairline-firm hover:shadow-e2 focus-within:border-hairline-firm",
    className,
  );
}

export function Card({
  padding = "md",
  interactive = false,
  className,
  as: Tag = "section",
  ...props
}: Omit<ComponentProps<"section">, "ref"> & {
  padding?: keyof typeof CARD_PADDING;
  interactive?: boolean;
  as?: "section" | "div" | "article" | "aside";
}) {
  return <Tag className={cardClass({ padding, interactive, className })} {...props} />;
}

/** The titled strip across the top of a card with `padding="none"`. */
export function CardHeader({
  title,
  description,
  icon,
  count,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  count?: number;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-separator px-4 py-3 sm:px-5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-body font-semibold text-foreground">
          {icon ? (
            <span className="text-foreground-muted [&_svg]:size-4" aria-hidden>
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{title}</span>
          {count !== undefined ? (
            <span className="text-label font-medium tabular-nums text-foreground-muted">
              {count}
            </span>
          ) : null}
        </h2>
        {description ? (
          <p className="mt-0.5 text-caption text-foreground-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Buttons                                                                  */
/* ------------------------------------------------------------------------ */

const BUTTON_VARIANT = {
  primary: "vu-btn-primary",
  secondary: "vu-btn-secondary",
  ghost: "vu-btn-ghost",
  danger: "vu-btn-danger",
} as const;

const BUTTON_SIZE = {
  sm: "h-8 gap-1.5 px-3 text-label",
  md: "h-9 gap-2 px-3.5 text-label",
  lg: "h-10 gap-2 px-4 text-body",
} as const;

const ICON_BUTTON_SIZE = {
  sm: "size-8",
  md: "size-9",
  lg: "size-10",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANT;
export type ButtonSize = keyof typeof BUTTON_SIZE;

type ButtonStyle = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square, for a lone icon. Give it an `aria-label`. */
  iconOnly?: boolean;
};

/** The class string, for the rare control that cannot be a `Button`. */
export function buttonClass({
  variant = "secondary",
  size = "md",
  iconOnly = false,
  className,
}: ButtonStyle & { className?: string } = {}) {
  return cn(
    "vu-btn inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap no-underline [&_svg]:shrink-0",
    BUTTON_VARIANT[variant],
    iconOnly ? ICON_BUTTON_SIZE[size] : BUTTON_SIZE[size],
    className,
  );
}

export function Button({
  variant,
  size,
  iconOnly,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & ButtonStyle) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, iconOnly, className })}
      {...props}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  iconOnly,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link className={buttonClass({ variant, size, iconOnly, className })} {...props} />;
}

/* ------------------------------------------------------------------------ */
/* Badges and counts                                                        */
/* ------------------------------------------------------------------------ */

const BADGE_TONE = {
  neutral: "bg-default text-foreground-muted",
  brand: "bg-brand-wash text-on-brand-wash",
  success: "bg-success-wash text-success",
  warning: "bg-warning-wash text-warning",
  danger: "bg-danger-wash text-danger",
  info: "bg-info-wash text-info",
  highlight: "bg-highlight-wash text-highlight-ink",
  solid: "bg-brand-fill text-brand-fill-foreground",
  outline: "border border-border bg-surface text-foreground-muted",
} as const;

export type BadgeTone = keyof typeof BADGE_TONE;

/** A status or a label. Colour is never the only carrier: the text says it. */
export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-chip px-1.5 py-0.5 text-micro font-semibold [&_svg]:size-3",
        BADGE_TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const COUNT_TONE = {
  highlight: "bg-highlight text-on-highlight",
  brand: "bg-brand-fill text-brand-fill-foreground",
  neutral: "bg-default text-foreground-muted",
} as const;

/**
 * An unread or waiting count. Terracotta by default: it is the one thing on a
 * screen meant to be noticed. One cap rule everywhere; pass a lower `max`
 * only where the space is a corner of an icon.
 */
export function CountBadge({
  count,
  max = 99,
  tone = "highlight",
  label,
  className,
}: {
  count: number;
  max?: number;
  tone?: keyof typeof COUNT_TONE;
  /** Spoken label, e.g. "3 unread". Omit when the surrounding text says it. */
  label?: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums",
        COUNT_TONE[tone],
        className,
      )}
      aria-label={label}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Navigation within a page                                                 */
/* ------------------------------------------------------------------------ */

/** A row of chips that scrolls sideways on a phone rather than wrapping. */
export function ChipRow({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role={label ? "group" : undefined}
      aria-label={label}
      className={cn(
        "vu-scroll-x -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Filter chip styling, for a link or a button. */
export function chipClass(active: boolean, className?: string) {
  return cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-label font-medium no-underline transition [&_svg]:size-3.5",
    active
      ? "border-transparent bg-brand-wash text-on-brand-wash"
      : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
    className,
  );
}

/** A filter or sort chip, as a link so the state stays in the URL. */
export function ChipLink({
  href,
  active,
  children,
  className,
  scroll = false,
  ariaCurrent = "true",
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  className?: string;
  scroll?: boolean;
  /** "page" when the chip is a navigation between views. */
  ariaCurrent?: "true" | "page";
}) {
  return (
    <Link
      href={href}
      scroll={scroll}
      aria-current={active ? ariaCurrent : undefined}
      className={chipClass(active, className)}
    >
      {children}
    </Link>
  );
}

/** Underlined section tabs: the views of one thing. */
export function TabBar({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "vu-scroll-x flex items-center gap-5 overflow-x-auto border-b border-border",
        className,
      )}
    >
      {children}
    </nav>
  );
}

export function tabClass(active: boolean, className?: string) {
  return cn(
    "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-label font-medium no-underline transition [&_svg]:size-4",
    active
      ? "border-brand text-foreground"
      : "border-transparent text-foreground-muted hover:border-hairline-firm hover:text-foreground",
    className,
  );
}

export function TabLink({
  href,
  active,
  children,
  className,
  scroll = false,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={scroll}
      aria-current={active ? "page" : undefined}
      className={tabClass(active, className)}
    >
      {children}
    </Link>
  );
}

/** A segmented control's track. Items use `segmentClass`. */
export function Segmented({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role={label ? "group" : undefined}
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5 rounded-ctl bg-default p-0.5", className)}
    >
      {children}
    </div>
  );
}

export function segmentClass(active: boolean, className?: string) {
  return cn(
    "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[calc(var(--r-ctl)-2px)] px-3 text-label font-medium no-underline transition [&_svg]:size-4",
    active
      ? "bg-surface text-foreground shadow-e1"
      : "text-foreground-muted hover:text-foreground",
    className,
  );
}

/* ------------------------------------------------------------------------ */
/* Forms                                                                    */
/* ------------------------------------------------------------------------ */

const FIELD_SIZE = {
  sm: "h-8 px-2.5 text-label",
  md: "h-9 px-3 text-body",
  lg: "h-10 px-3.5 text-body",
} as const;

/**
 * Text inputs, selects and textareas share one look. `vu-field` carries the
 * focus treatment in globals.css, because the global focus outline is
 * unlayered and a utility cannot replace it.
 */
export function fieldClass({
  size = "md",
  multiline = false,
  className,
}: { size?: keyof typeof FIELD_SIZE; multiline?: boolean; className?: string } = {}) {
  return cn(
    "vu-field w-full min-w-0 rounded-ctl border border-field-border bg-field-background text-field-foreground transition placeholder:text-field-placeholder disabled:cursor-not-allowed disabled:opacity-60",
    multiline ? "min-h-24 px-3 py-2 text-body leading-relaxed" : FIELD_SIZE[size],
    className,
  );
}

export function Input({
  size,
  className,
  ...props
}: Omit<ComponentProps<"input">, "size"> & { size?: keyof typeof FIELD_SIZE }) {
  return <input className={fieldClass({ size, className })} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={fieldClass({ multiline: true, className })} {...props} />;
}

export function Select({
  size,
  className,
  children,
  ...props
}: Omit<ComponentProps<"select">, "size"> & { size?: keyof typeof FIELD_SIZE }) {
  return (
    <select className={fieldClass({ size, className: cn("vu-select pr-8", className) })} {...props}>
      {children}
    </select>
  );
}

/** A label, the control, and the line under it: a hint, or the error. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  optional,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-label font-medium text-foreground">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        ) : null}
        {optional ? (
          <span className="ml-1.5 font-normal text-foreground-muted">Optional</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-caption text-foreground-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** A group of fields under a heading, as a form section. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-8", className)}>
      <div>
        <h2 className="text-body font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-label text-foreground-muted">{description}</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Feedback                                                                 */
/* ------------------------------------------------------------------------ */

const CALLOUT_TONE = {
  info: { box: "border-info/20 bg-info-wash", icon: "text-info", Icon: Info },
  success: { box: "border-success/20 bg-success-wash", icon: "text-success", Icon: CheckCircle2 },
  warning: { box: "border-warning/25 bg-warning-wash", icon: "text-warning", Icon: AlertTriangle },
  danger: { box: "border-danger/20 bg-danger-wash", icon: "text-danger", Icon: AlertCircle },
  brand: { box: "border-brand/15 bg-brand-wash", icon: "text-brand", Icon: Sparkles },
  neutral: { box: "border-border bg-surface-muted", icon: "text-foreground-muted", Icon: Info },
} as const;

/** An inline message: a saved notice, a warning, an error the page can show. */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
  role,
}: {
  tone?: keyof typeof CALLOUT_TONE;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode | false;
  className?: string;
  role?: "status" | "alert";
}) {
  const style = CALLOUT_TONE[tone];
  const Icon = style.Icon;
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={cn(
        "flex items-start gap-3 rounded-card border px-4 py-3 text-body text-foreground",
        style.box,
        className,
      )}
    >
      {icon === false ? null : (
        <span className={cn("mt-0.5 shrink-0 [&_svg]:size-4", style.icon)} aria-hidden>
          {icon ?? <Icon />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(title ? "mt-0.5 text-foreground-muted" : undefined)}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Nothing here yet: say what would be here, and how to put it there. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  size = "md",
  bordered = true,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** One or two `ButtonLink`s. */
  action?: ReactNode;
  size?: "sm" | "md";
  /** Off when the empty state already sits inside a card. */
  bordered?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        size === "md" ? "px-6 py-12 sm:py-16" : "px-4 py-8",
        bordered && "rounded-card border border-dashed border-hairline-firm",
        className,
      )}
    >
      {icon ? (
        <span
          className={cn(
            "grid place-items-center rounded-full bg-brand-wash text-on-brand-wash",
            size === "md" ? "size-12 [&_svg]:size-5" : "size-10 [&_svg]:size-4.5",
          )}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <h2
        className={cn(
          "font-semibold text-foreground text-balance",
          icon ? "mt-4" : undefined,
          size === "md" ? "text-title" : "text-body",
        )}
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-1.5 max-w-[46ch] text-body text-foreground-muted text-pretty">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}

/** Something failed: what happened, what to try, and a reference to quote. */
export function ErrorState({
  title = "Something went wrong",
  description = "We could not load this just now. Try again, or come back in a moment.",
  action,
  digest,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  digest?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-card border border-border bg-surface px-6 py-12 text-center shadow-e1 sm:py-14",
        className,
      )}
    >
      <span
        className="grid size-12 place-items-center rounded-full bg-danger-wash text-danger [&_svg]:size-5"
        aria-hidden
      >
        <AlertTriangle />
      </span>
      <h2 className="mt-4 text-title font-semibold text-foreground text-balance">{title}</h2>
      <p className="mt-1.5 max-w-[46ch] text-body text-foreground-muted text-pretty">
        {description}
      </p>
      {action ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
      {digest ? (
        <p className="mt-4 text-caption text-foreground-muted">
          Reference <code className="font-mono">{digest}</code>
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Progress                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * How far through something a member is: a course, a challenge, a roadmap
 * milestone. The number is always in the label as well, so the bar is never
 * the only thing carrying it.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  tone = "brand",
  size = "md",
  className,
}: {
  value: number;
  max?: number;
  /** Spoken label, e.g. "Course progress". */
  label: string;
  /** Print the percentage beside the bar. */
  showValue?: boolean;
  tone?: "brand" | "highlight" | "success";
  size?: "sm" | "md";
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className={cn(
          "min-w-0 flex-1 overflow-hidden rounded-full bg-default",
          size === "sm" ? "h-1.5" : "h-2",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            tone === "brand" && "bg-brand",
            tone === "highlight" && "bg-highlight",
            tone === "success" && "bg-success",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showValue ? (
        <span className="shrink-0 text-caption font-medium tabular-nums text-foreground-muted">
          {percent}%
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Data                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * A metric. `hint` carries the comparison, never a made-up trend: a
 * percentage with no period behind it is decoration.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  href,
  flush = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  href?: string;
  /** Inside a card the dividers come from the grid, not from each tile. */
  flush?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <dt className="text-caption font-medium text-foreground-muted">{label}</dt>
      <dd
        className={cn(
          "mt-2 text-display font-bold leading-none tracking-[-0.025em] tabular-nums",
          tone === "good" && "text-success",
          tone === "warn" && "text-warning",
          tone === "bad" && "text-danger",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </dd>
      {hint ? <p className="mt-1.5 text-caption text-foreground-muted">{hint}</p> : null}
    </>
  );

  const base = flush
    ? "block bg-surface p-4"
    : cn(cardClass({ padding: "none" }), "block p-4");

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          "no-underline transition",
          flush ? "hover:bg-surface-muted" : "hover:border-hairline-firm hover:shadow-e2",
          className,
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={cn(base, className)}>{body}</div>;
}

/** Table shell. Rows are hairline-separated so a long list reads as a ledger. */
export function Table({
  head,
  children,
  className,
}: {
  head: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-left text-label">
        <thead className="border-b border-border bg-surface-muted/60">
          <tr className="text-micro font-semibold uppercase tracking-[0.06em] text-foreground-muted">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("whitespace-nowrap px-4 py-2.5 font-semibold", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr
      className={cn(
        "border-b border-separator transition last:border-b-0 hover:bg-surface-muted/60",
        className,
      )}
    >
      {children}
    </tr>
  );
}

/** Previous and next, as links. A missing href is a disabled end. */
export function Pager({
  prevHref,
  nextHref,
  summary,
  label = "Pagination",
  className,
}: {
  prevHref?: string | null;
  nextHref?: string | null;
  summary?: ReactNode;
  /** Spoken name of the pager, e.g. "Member pages". */
  label?: string;
  className?: string;
}) {
  const end = buttonClass({ size: "sm", className: "pointer-events-none opacity-50" });
  return (
    <nav
      aria-label={label}
      className={cn("flex items-center justify-between gap-3", className)}
    >
      {prevHref ? (
        <ButtonLink href={prevHref} size="sm" rel="prev">
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </ButtonLink>
      ) : (
        <span className={end} aria-disabled="true">
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </span>
      )}
      {summary ? (
        <p className="text-caption tabular-nums text-foreground-muted">{summary}</p>
      ) : null}
      {nextHref ? (
        <ButtonLink href={nextHref} size="sm" rel="next">
          Next
          <ChevronRight className="size-4" aria-hidden />
        </ButtonLink>
      ) : (
        <span className={end} aria-disabled="true">
          Next
          <ChevronRight className="size-4" aria-hidden />
        </span>
      )}
    </nav>
  );
}

/* ------------------------------------------------------------------------ */
/* Overlays (styling only; behaviour stays with each client component)      */
/* ------------------------------------------------------------------------ */

/** The dimmed layer behind a dialog or a sheet. */
export const backdropClass = "fixed inset-0 bg-backdrop";

/** A dialog's panel. */
export const dialogClass = "rounded-modal border border-border bg-overlay text-foreground shadow-e3";

/** A dropdown menu and its rows. */
export const menuClass =
  "min-w-48 overflow-hidden rounded-card border border-border bg-overlay p-1 text-foreground shadow-e3";

export const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-[calc(var(--r-card)-0.375rem)] px-2.5 py-2 text-left text-label font-medium text-foreground no-underline transition hover:bg-surface-muted [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-foreground-muted";
