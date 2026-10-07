import type { ComponentType } from "react";
import type { ThemeDialogProps } from "@/components/theme/theme-dialog";

/**
 * The Theme dialog, fetched the first time it is wanted.
 *
 * The dialog, its motion code and the Aceternity parts it is built from are a
 * separate chunk that no page loads up front: the rail only carries a button.
 * Hovering or focusing the button starts the download early, and every caller
 * shares the one request. A failed download is forgotten, so the next attempt
 * tries again.
 */
let pending: Promise<ComponentType<ThemeDialogProps>> | null = null;

export function loadThemeDialog(): Promise<ComponentType<ThemeDialogProps>> {
  pending ??= import("@/components/theme/theme-dialog").then(
    (module) => module.ThemeDialog,
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}
