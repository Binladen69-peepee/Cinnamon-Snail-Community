"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, backdropClass, dialogClass, fieldClass } from "@/components/app/ui";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * The dialogs behind "Report" and "Delete": a plain modal, its buttons, and the
 * pick-a-reason report form. Their own module, with no server action of their
 * own, so a post's menu and a message thread can both use them without one
 * dragging the other's actions (and everything those import) along.
 */

/**
 * A plain modal.
 *
 * Escape closes it, the backdrop closes it, and the panel stops clicks from
 * reaching the backdrop.
 *
 * It portals into the app root rather than rendering where the menu is. The
 * menu sits inside a post card, and anything that gives the card paint
 * containment or clipping also makes it the containing block for a fixed
 * child, so the dialog was confined to the card it came from. Into the app
 * root rather than <body>, so the app's type and button rules still reach it.
 * It only ever mounts after a click, so `document` is always there.
 */
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const root =
    typeof document === "undefined"
      ? null
      : (document.querySelector("[data-app-shell]") ?? document.body);

  const modal = (
    <div
      className={cn(backdropClass, "z-70 grid place-items-center p-4")}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={cn(dialogClass, "w-full max-w-md p-5 sm:p-6")}
      >
        <h2 className="text-title font-semibold text-foreground">{title}</h2>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );

  return root ? createPortal(modal, root) : modal;
}

/**
 * Pick a reason, add a note, send. Shared by posts and direct messages, so a
 * member reports either the same way and a moderator reads the same reasons.
 */
export function ReasonReportDialog({
  title,
  reasons,
  send,
  onClose,
}: {
  title: string;
  reasons: readonly { value: string; label: string }[];
  /** Receives `reason` and `details`; adds whatever names the thing reported. */
  send: (data: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string>(reasons[0]!.value);
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const data = new FormData();
    data.set("reason", reason);
    data.set("details", details);
    startTransition(async () => {
      const result = await send(data);
      if (result.ok) {
        toast.success("Thank you. A moderator will look at this.");
        onClose();
      } else {
        toast.danger(result.error);
      }
    });
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-body text-foreground-muted">
        Moderators see the reason you pick. The author is not told who reported
        them.
      </p>
      <div role="radiogroup" aria-label="Reason" className="mt-4 space-y-1.5">
        {reasons.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-ctl border px-3 py-2.5 text-body transition",
              reason === option.value
                ? "border-brand bg-brand-wash font-medium text-foreground"
                : "border-border text-foreground-muted hover:border-hairline-firm hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name="report-reason"
              value={option.value}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
              className="size-4 shrink-0"
            />
            {option.label}
          </label>
        ))}
      </div>
      <textarea
        value={details}
        onChange={(event) => setDetails(event.target.value)}
        rows={3}
        maxLength={500}
        aria-label="Anything else a moderator should know"
        placeholder="Anything else a moderator should know (optional)"
        className={fieldClass({ multiline: true, className: "mt-3 min-h-20" })}
      />
      <DialogButtons
        pending={pending}
        confirmLabel="Send report"
        onCancel={onClose}
        onConfirm={submit}
      />
    </Modal>
  );
}

export function DialogButtons({
  pending,
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-end gap-2">
      <Button onClick={onCancel}>Cancel</Button>
      <Button
        variant={destructive ? "danger" : "primary"}
        disabled={pending}
        onClick={onConfirm}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {confirmLabel}
      </Button>
    </div>
  );
}
