"use client";

import { useState, useTransition } from "react";
import { deletePostAction, reportPostAction } from "@/app/(member)/community-actions";
import { PostMenu } from "@/components/feed/post-menu";
import { REPORT_REASONS } from "@/lib/community/report-reasons";
import { toast } from "@/components/ui/toast";
import { DialogButtons, Modal, ReasonReportDialog } from "@/components/ui/report-dialog";

/**
 * The overflow menu and the dialogs behind it.
 *
 * Reporting and deleting both need something from the member before they can
 * happen — a reason, a confirmation — so neither belongs on a menu item that
 * fires immediately. The menu opens a dialog; the dialog does the work.
 *
 * Sharing a post into another space is gone with the spaces themselves
 * (DEC-078). Posts that were shared before keep their link to the original.
 */
export function PostOverflow({
  postId,
  pinned,
  canPin,
  canDelete,
  canReport = true,
  onDeleted,
}: {
  postId: string;
  pinned: boolean;
  canPin: boolean;
  canDelete: boolean;
  /** Off for the author: reporting your own post is not a thing to offer. */
  canReport?: boolean;
  /** Called once the post is gone, so the card can leave the page. */
  onDeleted?: () => void;
}) {
  const [dialog, setDialog] = useState<"report" | "delete" | null>(null);

  return (
    <>
      <PostMenu
        postId={postId}
        pinned={pinned}
        canPin={canPin}
        canDelete={canDelete}
        canReport={canReport}
        onReport={() => setDialog("report")}
        onDelete={() => setDialog("delete")}
      />
      {dialog === "report" ? (
        <ReportDialog postId={postId} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "delete" ? (
        <DeleteDialog
          postId={postId}
          onClose={() => setDialog(null)}
          onDeleted={onDeleted}
        />
      ) : null}
    </>
  );
}

function ReportDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  return (
    <ReasonReportDialog
      title="Report this post"
      reasons={REPORT_REASONS}
      onClose={onClose}
      send={(data) => {
        data.set("postId", postId);
        return reportPostAction(data);
      }}
    />
  );
}

function DeleteDialog({
  postId,
  onClose,
  onDeleted,
}: {
  postId: string;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function submit() {
    const data = new FormData();
    data.set("postId", postId);
    startTransition(async () => {
      const result = await deletePostAction(data);
      if (result.ok) {
        toast.success("Post removed.");
        onClose();
        onDeleted?.();
      } else {
        toast.danger(result.error);
      }
    });
  }

  return (
    <Modal title="Delete this post" onClose={onClose}>
      <p className="text-body leading-relaxed text-foreground-muted">
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
