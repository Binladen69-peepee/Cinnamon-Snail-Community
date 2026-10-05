"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, RotateCcw, Trash2, UserMinus, X } from "lucide-react";
import {
  removePostAction,
  setMemberStatusAction,
  setReportStatusAction,
} from "@/app/admin/moderation/actions";
import { Button } from "@/components/app/ui";

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
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error ? (
        <p role="alert" className="mr-auto text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}

      {closed ? (
        <Button size="sm" disabled={pending} onClick={() => setStatus("OPEN")}>
          <RotateCcw className="size-4" aria-hidden />
          Reopen
        </Button>
      ) : (
        <>
          {status === "OPEN" ? (
            <Button size="sm" disabled={pending} onClick={() => setStatus("REVIEWING")}>
              <Eye className="size-4" aria-hidden />
              Reviewing
            </Button>
          ) : null}

          {postId ? (
            <Button size="sm" variant="danger" disabled={pending} onClick={removePost}>
              <Trash2 className="size-4" aria-hidden />
              Remove post
            </Button>
          ) : null}

          {subject ? (
            <Button size="sm" variant="danger" disabled={pending} onClick={suspend}>
              <UserMinus className="size-4" aria-hidden />
              Suspend
            </Button>
          ) : null}

          <Button size="sm" disabled={pending} onClick={() => setStatus("DISMISSED")}>
            <X className="size-4" aria-hidden />
            Dismiss
          </Button>

          <Button
            size="sm"
            variant="primary"
            disabled={pending}
            onClick={() => setStatus("RESOLVED")}
          >
            <Check className="size-4" aria-hidden />
            Resolve
          </Button>
        </>
      )}
    </div>
  );
}
