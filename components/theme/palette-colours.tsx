"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/app/ui";
import type { Palette } from "@/lib/theme/palettes";

const SHADES = ["Darkest", "Dark", "Light", "Lightest"] as const;

/**
 * The chosen palette's four colours, each with its code and a copy button.
 * The outcome is spoken through the dialog's live region (`onAnnounce`), and
 * the button says "Copied" for a moment.
 *
 * Render it with `key={palette.id}`, so a "Copied" from one palette does not
 * carry over to the next.
 */
export function PaletteColours({
  palette,
  onAnnounce,
}: {
  palette: Palette;
  onAnnounce: (message: string) => void;
}) {
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (copied === null) return;
    const timer = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (index: number, hex: string) => {
    try {
      // Missing outside a secure context; the catch covers that too.
      await navigator.clipboard.writeText(hex);
      setCopied(index);
      onAnnounce(`Copied ${hex}`);
    } catch {
      onAnnounce(`Couldn't copy ${hex}. Select the code to copy it instead.`);
    }
  };

  return (
    <ul className="flex flex-col divide-y divide-separator">
      {palette.swatches.map((swatch, index) => {
        const hex = swatch.toUpperCase();
        const done = copied === index;
        return (
          <li key={index} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            <span
              aria-hidden
              className="size-9 shrink-0 rounded-ctl inset-ring-1 inset-ring-foreground/10"
              style={{ backgroundColor: swatch }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-caption text-foreground-muted">{SHADES[index]}</span>
              <span className="block select-all font-mono text-label font-medium tracking-wide text-foreground">
                {hex}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 sm:h-8"
              onClick={() => void copy(index, hex)}
            >
              {done ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {done ? "Copied" : "Copy"}
              <span className="sr-only"> {hex}</span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
