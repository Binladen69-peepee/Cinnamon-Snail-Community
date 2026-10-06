"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, backdropClass, dialogClass } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * A plain modal for the board's few confirmations: reporting, withdrawing,
 * merging.
 *
 * Escape and the backdrop close it; focus moves into it when it opens and
 * back to whatever opened it when it closes. It portals into the app root (or
 * the console root) so a card's overflow or containment cannot trap it, while
 * the app's type and button rules still reach it.
 */
export function IdeaDialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  // The latest handler, without re-running the mount effect below on every
  // render of the parent (which would steal focus while someone types).
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = panel.current;
    // The first field if there is one; otherwise the dialog itself, so a
    // destructive confirm is never the thing Enter presses by default.
    const first = node?.querySelector<HTMLElement>("input, textarea, select");
    (first ?? node)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close.current();
        return;
      }
      // Keep Tab inside the dialog while it is open.
      if (event.key !== "Tab" || !node) return;
      const focusable = [
        ...node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (focusable.length === 0) return;
      const firstItem = focusable[0]!;
      const lastItem = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === firstItem || active === node)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  const root =
    typeof document === "undefined"
      ? null
      : (document.querySelector("[data-app-shell], .vu-admin") ?? document.body);

  const modal = (
    <div
      className={cn(backdropClass, "z-70 grid place-items-center p-4")}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={cn(dialogClass, "max-h-[90dvh] w-full max-w-md overflow-y-auto p-5 sm:p-6")}
      >
        <h2 id={titleId} className="text-title font-semibold text-foreground">
          {title}
        </h2>
        {description ? (
          <div id={descriptionId} className="mt-1.5 text-body text-foreground-muted">
            {description}
          </div>
        ) : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );

  return root ? createPortal(modal, root) : modal;
}

/** Cancel and the one action, at the foot of a dialog. */
export function DialogActions({
  pending,
  confirmLabel,
  destructive = false,
  disabled = false,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  confirmLabel: string;
  destructive?: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
      <Button onClick={onCancel}>Cancel</Button>
      <Button
        variant={destructive ? "danger" : "primary"}
        disabled={pending || disabled}
        onClick={onConfirm}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {confirmLabel}
      </Button>
    </div>
  );
}
