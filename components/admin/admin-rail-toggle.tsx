"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ADMIN_RAIL_COOKIE } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

/**
 * Collapses the console rail to its icons, or expands it again.
 *
 * The rail carries one of each, and the CSS keyed on `data-rail` shows the one
 * that applies, so neither keeps state that could fall out of step with the
 * other. A press flips the attribute on the console root for an instant
 * change, writes a cookie the layout reads so the next page is rendered at the
 * same width, and hands focus to the control that has just appeared.
 */
export function AdminRailToggle({
  mode,
  className,
}: {
  mode: "collapse" | "expand";
  className?: string;
}) {
  const collapse = mode === "collapse";

  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const root = event.currentTarget.closest(".vu-admin");
    root?.setAttribute("data-rail", collapse ? "collapsed" : "open");
    // A year; the console is the only reader.
    document.cookie = `${ADMIN_RAIL_COOKIE}=${collapse ? "collapsed" : "open"}; path=/admin; max-age=31536000; samesite=lax`;
    root
      ?.querySelector<HTMLButtonElement>(`[data-rail-toggle="${collapse ? "expand" : "collapse"}"]`)
      ?.focus();
  };

  const label = collapse ? "Collapse the menu" : "Expand the menu";
  const Icon = collapse ? PanelLeftClose : PanelLeftOpen;
  return (
    <button
      type="button"
      onClick={onClick}
      data-rail-toggle={mode}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-ctl text-foreground-muted transition hover:bg-surface-muted hover:text-foreground",
        className,
      )}
    >
      <Icon className="size-4.5" aria-hidden />
    </button>
  );
}
