import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A dashboard card, after the client's reference (DEC-088): the surface with
 * a faint edge and a wide soft shadow, a title with a muted line under it, and
 * the card's one action — "View all", a legend — on the right.
 */
export function DashCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  labelledBy,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  labelledBy?: string;
}) {
  const id = labelledBy ?? `dash-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cn("vu-dash-card flex min-w-0 flex-col p-4 sm:p-5", className)}>
      {/* The action wraps under the title when the card is too narrow for
          both, rather than squeezing the title to a letter. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-[min(8rem,100%)] flex-1">
          <h2 id={id} className="truncate text-body font-semibold text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-label text-foreground-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex max-w-full shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div className={cn("mt-4 flex min-h-0 flex-1 flex-col", bodyClassName)}>{children}</div>
    </section>
  );
}

/** The reference's "View All", in the palette's link colour. */
export function ViewAllLink({ href, children = "View all" }: { href: string; children?: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-chip text-label font-semibold text-link no-underline transition hover:underline hover:underline-offset-4"
    >
      {children}
    </Link>
  );
}

/** A quiet line for a card with nothing to show yet. Says why, never draws a shape. */
export function DashEmpty({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) {
  return (
    <div className="vu-dash-well flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-surface text-foreground-muted shadow-e1 [&_svg]:size-4.5" aria-hidden>
        {icon}
      </span>
      <p className="text-label font-semibold text-foreground">{title}</p>
      {detail ? <p className="max-w-[32ch] text-caption leading-snug text-foreground-muted">{detail}</p> : null}
    </div>
  );
}

export const numberFormat = new Intl.NumberFormat("en-US");
