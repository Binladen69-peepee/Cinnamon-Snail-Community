"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Flag, Pencil, Trash2 } from "lucide-react";
import { reportIdeaAction, withdrawIdeaAction } from "@/app/(member)/ideas/actions";
import { Button, ButtonLink, fieldClass } from "@/components/app/ui";
import { DialogActions, IdeaDialog } from "@/components/ideas/idea-dialog";
import { toast } from "@/components/ui/toast";
import { REPORT_REASONS } from "@/lib/community/report-reasons";
import { cn } from "@/lib/utils";

/**
 * What a member can do to an idea besides voting and replying: report it
 * (anyone but its author), and fix or withdraw it (its author, within the
 * rules in `lib/ideas/rules.ts`). Plain buttons in a row rather than a hidden
 * menu: there are never more than two.
 */
export function IdeaActions({
  ideaId,
  title,
  canReport,
  canEdit,
  canWithdraw,
}: {
  ideaId: string;
  title: string;
  canReport: boolean;
  canEdit: boolean;
  canWithdraw: boolean;
}) {
  const [dialog, setDialog] = useState<"report" | "withdraw" | null>(null);
  if (!canReport && !canEdit && !canWithdraw) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {canEdit ? (
        <ButtonLink href={`/ideas/${ideaId}/edit`} variant="ghost" size="sm">
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </ButtonLink>
      ) : null}
      {canWithdraw ? (
        <Button variant="ghost" size="sm" onClick={() => setDialog("withdraw")}>
          <Trash2 className="size-3.5" aria-hidden />
          Withdraw
        </Button>
      ) : null}
      {canReport ? (
        <Button variant="ghost" size="sm" onClick={() => setDialog("report")}>
          <Flag className="size-3.5" aria-hidden />
          Report
        </Button>
      ) : null}

      {dialog === "report" ? (
        <ReportDialog ideaId={ideaId} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "withdraw" ? (
        <WithdrawDialog ideaId={ideaId} title={title} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function ReportDialog({ ideaId, onClose }: { ideaId: string; onClose: () => void }) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]!.value);
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();

  function send() {
    const data = new FormData();
    data.set("ideaId", ideaId);
    data.set("reason", reason);
    data.set("details", details);
    startTransition(async () => {
      try {
        const result = await reportIdeaAction(data);
        if (result.ok) {
          toast.success(result.detail ?? "Thank you. A moderator will look at this.");
          onClose();
        } else {
          toast.danger(result.error);
        }
      } catch {
        toast.danger("That report did not send. Check your connection and try again.");
      }
    });
  }

  return (
    <IdeaDialog
      title="Report this idea"
      description="Moderators see the reason you pick. The author is not told who reported it."
      onClose={onClose}
    >
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Reason</legend>
        {REPORT_REASONS.map((option) => (
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
              name="idea-report-reason"
              value={option.value}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
              className="size-4 shrink-0"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <label className="mt-3 block">
        <span className="sr-only">Anything else a moderator should know</span>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Anything else a moderator should know (optional)"
          className={fieldClass({ multiline: true, className: "min-h-20" })}
        />
      </label>
      <DialogActions
        pending={pending}
        confirmLabel="Send report"
        onCancel={onClose}
        onConfirm={send}
      />
    </IdeaDialog>
  );
}

function WithdrawDialog({
  ideaId,
  title,
  onClose,
}: {
  ideaId: string;
  title: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function withdraw() {
    const data = new FormData();
    data.set("ideaId", ideaId);
    startTransition(async () => {
      try {
        const result = await withdrawIdeaAction(data);
        if (result.ok) {
          toast.success("Your idea is withdrawn.");
          onClose();
          router.push("/ideas");
        } else {
          toast.danger(result.error);
        }
      } catch {
        toast.danger("That did not go through. Check your connection and try again.");
      }
    });
  }

  return (
    <IdeaDialog
      title="Withdraw this idea?"
      description={
        <>
          “{title}” comes off the board for good. You can withdraw it because nobody else has
          voted or replied yet.
        </>
      }
      onClose={onClose}
    >
      <DialogActions
        pending={pending}
        confirmLabel="Withdraw"
        destructive
        onCancel={onClose}
        onConfirm={withdraw}
      />
    </IdeaDialog>
  );
}
