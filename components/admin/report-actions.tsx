"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, RotateCcw, Trash2, UserMinus, X } from "lucide-react";
import {
  removePostAction,
  setMemberStatusAction,
  setReportStatusAction,
} from "@/app/admin/moderation/actions";
import { AdminButton } from "@/components/admin/ui";

/**
 * What a moderator can do about one report.
 *
 * The two destructive outcomes — taking a post down and suspending an account —
 * confirm first and name the person or thing they affect, because both are
 * visible to somebody immediately and neither is obvious to undo from the queue.
 * Changing a report's own status does not confirm: it is bookkeeping and the
 * opposite button is right there.
 */
export function ReportActions({
  reportId,
  status,
  postId,
  subject,
}: {
  reportId: string;
  status: string;
  postId: string | null;
  subject: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result.error ?? "That did not work.");
    });
  }

  function setStatus(next: string) {
    const data = new FormData();
    data.set("id", reportId);
    data.set("status", next);
    run(() => setReportStatusAction(data));
  }

  function removePost() {
    if (!postId) return;
    if (
      !window.confirm(
        "Take this post down? It disappears from every member surface. The row is kept so the report keeps its evidence.",
      )
    ) {
      return;
    }
    const data = new FormData();
    data.set("postId", postId);
    data.set("reportId", reportId);
    run(() => removePostAction(data));
  }

  function suspend() {
    if (!subject) return;
    if (
      !window.confirm(
        `Suspend ${subject.name}? They lose access to the community, messages and classes until reinstated.`,
      )
    ) {
      return;
    }
    const data = new FormData();
    data.set("userId", subject.id);
    data.set("suspend", "1");
    run(() => setMemberStatusAction(data));
  }

  const closed = status === "RESOLVED" || status === "DISMISSED";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error ? (
        <p role="alert" className="mr-auto text-[12px] font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {closed ? (
        <AdminButton disabled={pending} onClick={() => setStatus("OPEN")}>
          <RotateCcw className="size-3.5" aria-hidden />
          Reopen
        </AdminButton>
      ) : (
        <>
          {status === "OPEN" ? (
            <AdminButton disabled={pending} onClick={() => setStatus("REVIEWING")}>
              <Eye className="size-3.5" aria-hidden />
              Reviewing
            </AdminButton>
          ) : null}

          {postId ? (
            <AdminButton variant="danger" disabled={pending} onClick={removePost}>
              <Trash2 className="size-3.5" aria-hidden />
              Remove post
            </AdminButton>
          ) : null}

          {subject ? (
            <AdminButton variant="danger" disabled={pending} onClick={suspend}>
              <UserMinus className="size-3.5" aria-hidden />
              Suspend
            </AdminButton>
          ) : null}

          <AdminButton disabled={pending} onClick={() => setStatus("DISMISSED")}>
            <X className="size-3.5" aria-hidden />
            Dismiss
          </AdminButton>

          <AdminButton
            variant="primary"
            disabled={pending}
            onClick={() => setStatus("RESOLVED")}
          >
            <Check className="size-3.5" aria-hidden />
            Resolve
          </AdminButton>
        </>
      )}
    </div>
  );
}
