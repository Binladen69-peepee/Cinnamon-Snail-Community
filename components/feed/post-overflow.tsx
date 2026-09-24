"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  deletePostAction,
  reportPostAction,
  sharePostAction,
} from "@/app/(member)/community-actions";
import { PostMenu } from "@/components/feed/post-menu";
import { REPORT_REASONS } from "@/lib/community/report-reasons";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * The overflow menu and the three dialogs behind it.
 *
 * Reporting, sharing and deleting all need something from the member before
 * they can happen — a reason, a destination, a confirmation — so none of them
 * belongs on a menu item that fires immediately. The menu opens a dialog; the
 * dialog does the work.
 *
 * Reporting used to send one hardcoded reason, which told a moderator that
 * something was wrong and nothing about what. It now asks, because the reason
 * is most of the value of the report.
 */
export function PostOverflow({
  postId,
  pinned,
  canPin,
  canDelete,
}: {
  postId: string;
  pinned: boolean;
  canPin: boolean;
  canDelete: boolean;
}) {
  const [dialog, setDialog] = useState<"report" | "share" | "delete" | null>(null);

  return (
    <>
      <PostMenu
        postId={postId}
        pinned={pinned}
        canPin={canPin}
        canDelete={canDelete}
        canShare
        onReport={() => setDialog("report")}
        onShare={() => setDialog("share")}
        onDelete={() => setDialog("delete")}
      />
      {dialog === "report" ? (
        <ReportDialog postId={postId} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "share" ? (
        <ShareDialog postId={postId} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "delete" ? (
        <DeleteDialog postId={postId} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}

/**
 * A plain modal.
 *
 * Escape closes it, the backdrop closes it, and the panel stops clicks from
 * reaching the backdrop. Small enough to keep here rather than reaching for a
 * dialog library for three uses.
 */
function Modal({
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

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[420px] rounded-card border border-border bg-surface p-5 shadow-e2"
      >
        <h2 className="text-[16px] font-bold text-foreground">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function ReportDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]!.value);
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const data = new FormData();
    data.set("postId", postId);
    data.set("reason", reason);
    data.set("details", details);
    startTransition(async () => {
      const result = await reportPostAction(data);
      if (result.ok) {
        toast.success("Thank you. A moderator will look at this.");
        onClose();
      } else {
        toast.danger(result.error);
      }
    });
  }

  return (
    <Modal title="Report this post" onClose={onClose}>
      <p className="text-[13px] text-foreground-muted">
        Moderators see the reason you pick. The author is not told who reported
        them.
      </p>
      <div role="radiogroup" aria-label="Reason" className="mt-3 space-y-1.5">
        {REPORT_REASONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-ctl border p-2.5 text-[13.5px] transition",
              reason === option.value
                ? "border-foreground text-foreground"
                : "border-border text-foreground-muted hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name="report-reason"
              value={option.value}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
              className="size-4 accent-foreground"
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
        placeholder="Anything else a moderator should know (optional)"
        className="mt-3 w-full rounded-ctl border border-field-border bg-field-background p-2.5 text-[13.5px] text-foreground outline-none focus:border-brand"
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

type ShareTarget = { id: string; name: string; needsApproval: boolean };

function ShareDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [spaces, setSpaces] = useState<ShareTarget[] | null>(null);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/community/my-spaces");
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { spaces: ShareTarget[] };
        if (cancelled) return;
        setSpaces(data.spaces);
        setTarget(data.spaces[0]?.id ?? "");
      } catch {
        if (!cancelled) setSpaces([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function submit() {
    if (!target) return;
    const data = new FormData();
    data.set("postId", postId);
    data.set("spaceId", target);
    data.set("note", note);
    startTransition(async () => {
      const result = await sharePostAction(data);
      if (result.ok) {
        toast.success("Shared.");
        onClose();
      } else {
        toast.danger(result.error);
      }
    });
  }

  const chosen = spaces?.find((space) => space.id === target);

  return (
    <Modal title="Share to a space" onClose={onClose}>
      {spaces === null ? (
        <p className="flex items-center gap-2 text-[13.5px] text-foreground-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading your spaces
        </p>
      ) : spaces.length === 0 ? (
        <p className="text-[13.5px] text-foreground-muted">
          There is nowhere you can post this right now.
        </p>
      ) : (
        <>
          <label
            htmlFor="share-space"
            className="mb-1.5 block text-[12.5px] font-semibold text-foreground"
          >
            Space
          </label>
          <select
            id="share-space"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="h-11 w-full rounded-ctl border border-field-border bg-field-background px-3 text-[14px] text-foreground outline-none focus:border-brand"
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Say something about it (optional)"
            className="mt-3 w-full rounded-ctl border border-field-border bg-field-background p-2.5 text-[13.5px] text-foreground outline-none focus:border-brand"
          />
          {chosen?.needsApproval ? (
            <p className="mt-2 text-[12.5px] text-foreground-muted">
              Posts in that space wait for a host before anyone sees them.
            </p>
          ) : null}
          <DialogButtons
            pending={pending}
            confirmLabel="Share"
            onCancel={onClose}
            onConfirm={submit}
          />
        </>
      )}
    </Modal>
  );
}

function DeleteDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [pending, startTransition] = useTransition();

  function submit() {
    const data = new FormData();
    data.set("postId", postId);
    startTransition(async () => {
      const result = await deletePostAction(data);
      if (result.ok) {
        toast.success("Post removed.");
        onClose();
      } else {
        toast.danger(result.error);
      }
    });
  }

  return (
    <Modal title="Delete this post" onClose={onClose}>
      <p className="text-[13.5px] leading-relaxed text-foreground-muted">
        This cannot be undone. The replies go with it.
      </p>
      <DialogButtons
        pending={pending}
        confirmLabel="Delete"
        destructive
        onCancel={onClose}
        onConfirm={submit}
      />
    </Modal>
  );
}

function DialogButtons({
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
    <div className="mt-4 flex items-center justify-end gap-2">
      <button type="button" onClick={onCancel} className="vu-btn h-11 px-4 text-[13.5px]">
        Cancel
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onConfirm}
        className={cn(
          "vu-btn h-11 px-4 text-[13.5px]",
          destructive ? "text-danger" : "vu-btn-primary",
        )}
      >
        {pending ? (
          <Loader2 className="mr-1.5 inline size-4 animate-spin" aria-hidden />
        ) : null}
        {confirmLabel}
      </button>
    </div>
  );
}
