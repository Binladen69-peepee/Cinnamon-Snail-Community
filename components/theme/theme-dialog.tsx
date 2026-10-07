"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { useTheme } from "next-themes";
import { RotateCcw } from "lucide-react";
import {
  AnimatedModal,
  ModalClose,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@/components/aceternity/animated-modal";
import { Button } from "@/components/app/ui";
import { ThemePanel } from "@/components/theme/theme-panel";
import { setAccent } from "@/lib/theme/accent";
import { DEFAULT_PALETTE, paletteById } from "@/lib/theme/palettes";

export type ThemeDialogProps = {
  open: boolean;
  onClose: () => void;
  /** The button that opened it, which gets focus back on close. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Render in place instead of into the app's root. For tests. */
  portal?: boolean;
};

/** The member app's root, or the console's. */
const APP_ROOT = "[data-app-shell], .vu-admin";

/**
 * The Theme dialog: Aceternity's animated modal around the theme panel.
 *
 * Loaded on demand (`./load-theme-dialog`), so neither it nor its motion code
 * is in any page's first download.
 *
 * It mounts inside the app's root rather than straight into <body>, as the
 * app's other dialogs do: the app's type and button rules are scoped to that
 * root, and the preview has to show the buttons the pages actually have.
 */
export function ThemeDialog({ open, onClose, returnFocusRef, portal = true }: ThemeDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const { setTheme } = useTheme();
  const [announcement, setAnnouncement] = useState("");
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Cleared, then set on the next frame, so the same message twice in a row
  // ("Copied #37353E", and again) is spoken twice.
  const announce = (message: string) => {
    setAnnouncement("");
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setAnnouncement(message));
  };

  const reset = () => {
    setAccent(DEFAULT_PALETTE);
    setTheme("system");
    announce(`Reset to ${paletteById(DEFAULT_PALETTE).name}, following your device's mode.`);
  };

  const container =
    portal && typeof document !== "undefined" ? document.querySelector(APP_ROOT) : null;

  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descriptionId}
      container={container}
      portal={portal}
      returnFocusRef={returnFocusRef}
      className="sm:max-w-170"
    >
      <ModalHeader>
        <div className="min-w-0 pt-1.5">
          <h2 id={titleId} className="text-heading font-semibold tracking-[-0.01em] text-foreground">
            Theme
          </h2>
          <p id={descriptionId} className="mt-0.5 text-body text-foreground-muted">
            Choose a palette and a mode. Saved on this device.
          </p>
        </div>
        <ModalClose />
      </ModalHeader>

      <ModalContent>
        <ThemePanel onAnnounce={announce} />
      </ModalContent>

      <ModalFooter className="justify-between">
        <Button variant="secondary" size="lg" onClick={reset}>
          <RotateCcw className="size-4" aria-hidden />
          Reset to default
        </Button>
        <Button variant="primary" size="lg" onClick={onClose}>
          Done
        </Button>
      </ModalFooter>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </AnimatedModal>
  );
}
