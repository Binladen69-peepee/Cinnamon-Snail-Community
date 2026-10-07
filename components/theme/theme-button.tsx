"use client";

import { useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { Palette } from "lucide-react";
import { loadThemeDialog } from "@/components/theme/load-theme-dialog";
import { CurrentPaletteStrip } from "@/components/theme/palette-strip";
import type { ThemeDialogProps } from "@/components/theme/theme-dialog";
import { syncAccentFromStorage, useAccent } from "@/lib/theme/accent";
import { paletteById } from "@/lib/theme/palettes";
import { cn } from "@/lib/utils";

/**
 * Opens the Theme dialog, where a member picks a palette and a mode
 * (DEC-082). It sits at the foot of the member rail (which the phone drawer
 * reuses), of the console rail, and in the console's phone bar.
 *
 * - `row` is built like the rail's own rows (height, radius, type, icon, and
 *   the role colours a band re-points), so it reads on the coloured rail in
 *   every palette and mode. The current palette's colours sit at its end.
 * - `icon` is a square button for a bar.
 *
 * The button is all that ships with the page. The dialog and its animation
 * code are fetched on the first open, or as soon as the pointer or focus
 * reaches the button.
 */
export function ThemeButton({
  variant = "row",
  className,
}: {
  variant?: "row" | "icon";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [Dialog, setDialog] = useState<ComponentType<ThemeDialogProps> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const palette = paletteById(useAccent());

  // Put the saved palette back if React's development remount took it off
  // <html>, or if another tab changed it while this one had no rail.
  useLayoutEffect(() => {
    syncAccentFromStorage();
  }, []);

  const prefetch = () => {
    loadThemeDialog().catch(() => {
      // Retried, and reported, when the button is actually pressed.
    });
  };

  const openDialog = () => {
    setOpen(true);
    if (Dialog) return;
    loadThemeDialog().then(
      (component) => setDialog(() => component),
      (error: unknown) => {
        setOpen(false);
        console.error(
          "[theme] the Theme dialog failed to load:",
          error instanceof Error ? error.message : error,
        );
      },
    );
  };

  const shared = {
    ref: buttonRef,
    type: "button" as const,
    "aria-haspopup": "dialog" as const,
    "aria-expanded": open,
    "aria-busy": open && !Dialog ? true : undefined,
    onClick: openDialog,
    onPointerEnter: prefetch,
    onFocus: prefetch,
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          {...shared}
          className={cn(
            // 36px to match the bar's other buttons, with a 40px touch target.
            "relative grid size-9 shrink-0 place-items-center rounded-ctl text-foreground-muted transition hover:bg-surface-muted hover:text-foreground before:absolute before:-inset-0.5",
            open && "bg-surface-muted text-foreground",
            className,
          )}
        >
          <Palette className="size-5" aria-hidden />
          <span className="sr-only">Theme, {palette.name}</span>
        </button>
      ) : (
        <button
          {...shared}
          className={cn(
            // The rail rows' build. 36px tall like them, with a 40px touch target.
            "relative flex h-9 w-full items-center gap-2.5 rounded-ctl px-2.5 text-left text-label font-medium transition before:absolute before:inset-x-0 before:-inset-y-0.5",
            open
              ? "bg-surface-muted text-foreground"
              : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
            className,
          )}
        >
          <Palette className="size-4.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">Theme</span>
          <span className="sr-only">, {palette.name}</span>
          <CurrentPaletteStrip />
        </button>
      )}

      {Dialog ? (
        <Dialog open={open} onClose={() => setOpen(false)} returnFocusRef={buttonRef} />
      ) : null}
    </>
  );
}
