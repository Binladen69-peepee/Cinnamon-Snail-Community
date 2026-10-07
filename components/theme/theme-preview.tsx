import { BookOpen, UtensilsCrossed } from "lucide-react";
import { Badge, Button, CountBadge, Input } from "@/components/app/ui";
import type { Palette } from "@/lib/theme/palettes";

/**
 * A corner of the app in the chosen palette and mode, built from the app's own
 * parts (components/app/ui.tsx) so it shows exactly what the pages will.
 *
 * It is a picture, not a form: the sample is inert and hidden from assistive
 * technology, with one sentence in its place, and nothing in it can take
 * focus.
 */
export function ThemePreview({ palette }: { palette: Palette }) {
  return (
    <section aria-label="Preview" className="flex flex-col gap-2.5">
      <h3 className="text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
        Preview
      </h3>
      <p className="sr-only">
        A sample of the app in the {palette.name} palette: the menu, a card with a badge and a
        link, a search field, and a primary and a secondary button.
      </p>
      <div
        aria-hidden
        inert
        className="flex flex-col gap-3 overflow-hidden rounded-card border border-border bg-background p-3 sm:p-4"
      >
        {/* The rail: the band the menu sits on, its chosen row, a count. */}
        <div className="vu-band flex max-w-full items-center gap-1 self-start overflow-hidden rounded-ctl p-1 shadow-e1">
          <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-[calc(var(--r-ctl)-0.25rem)] bg-sidebar-accent px-2.5 text-caption font-medium text-sidebar-accent-foreground">
            <UtensilsCrossed className="size-3.5" />
            Kitchen Table
          </span>
          <span className="flex h-7 shrink-0 items-center gap-1.5 px-2 text-caption font-medium text-foreground-muted">
            <BookOpen className="hidden size-3.5 sm:block" />
            Classes
            <CountBadge count={3} />
          </span>
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3 shadow-e1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-label font-semibold text-foreground">Winter soups, live</p>
            <Badge tone="brand">New</Badge>
          </div>
          <p className="text-caption text-foreground-muted">
            Thursday at 6pm.{" "}
            <span className="font-medium text-link underline underline-offset-2">See the schedule</span>
          </p>
          <Input readOnly tabIndex={-1} size="sm" placeholder="Search classes…" />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" tabIndex={-1}>
              Get started
            </Button>
            <Button variant="secondary" size="sm" tabIndex={-1}>
              Maybe later
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
