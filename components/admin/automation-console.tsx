"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Eye, Play, RotateCw } from "lucide-react";
import { AdminButton, Badge } from "@/components/admin/ui";
import { toast } from "@/components/ui/toast";
import {
  previewRuleAction,
  retryExecutionAction,
  runRuleNowAction,
  setPausedAction,
  setRuleEnabledAction,
  type PreviewResult,
} from "@/app/admin/automation/actions";
import type { RuleRow } from "@/lib/admin/automation";

/**
 * The interactive parts of the automation console.
 *
 * Switching a rule on, previewing who it would reach, running it now, pausing
 * everything, retrying a failed run. The page itself stays a server component;
 * only these controls are client-side.
 */

export function PauseAllSwitch({ paused }: { paused: boolean }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(formData) =>
        start(async () => {
          await setPausedAction(formData);
          toast.success(paused ? "Automations resumed." : "All automations paused.");
        })
      }
    >
      <input type="hidden" name="paused" value={paused ? "0" : "1"} />
      <AdminButton type="submit" variant={paused ? "primary" : "danger"} disabled={pending}>
        {pending ? "Working…" : paused ? "Resume automations" : "Pause all automations"}
      </AdminButton>
    </form>
  );
}

export function RuleControls({ rule }: { rule: RuleRow }) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const enabledForm = (formData: FormData) =>
    start(async () => {
      const result = await setRuleEnabledAction(formData);
      if (result.ok) toast.success(rule.enabled ? `"${rule.name}" is off.` : `"${rule.name}" is on.`);
      else toast.danger(result.error);
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={enabledForm}>
          <input type="hidden" name="slug" value={rule.slug} />
          <input type="hidden" name="enabled" value={rule.enabled ? "0" : "1"} />
          <AdminButton
            type="submit"
            variant={rule.enabled ? "secondary" : "primary"}
            disabled={pending || Boolean(rule.problem)}
          >
            {rule.enabled ? "Turn off" : "Turn on"}
          </AdminButton>
        </form>

        <form
          action={(formData) =>
            start(async () => {
              const result = await previewRuleAction(formData);
              setPreview(result);
              if (!result.ok) toast.danger(result.error);
            })
          }
        >
          <input type="hidden" name="slug" value={rule.slug} />
          <AdminButton type="submit" disabled={pending}>
            <Eye className="size-3.5" aria-hidden />
            Dry run
          </AdminButton>
        </form>

        <form
          action={(formData) =>
            start(async () => {
              const result = await runRuleNowAction(formData);
              if (result.ok) {
                toast.success(
                  `${result.fired} acted on, ${result.skipped} already done, ${result.failed} failed.`,
                );
              } else toast.danger(result.error);
            })
          }
        >
          <input type="hidden" name="slug" value={rule.slug} />
          <AdminButton type="submit" disabled={pending || !rule.enabled || Boolean(rule.problem)}>
            <Play className="size-3.5" aria-hidden />
            Run now
          </AdminButton>
        </form>
      </div>

      {preview?.ok ? (
        <div className="rounded-card border border-border bg-default/50 p-3">
          <p className="text-[12.5px] font-semibold text-foreground">
            {preview.matched} match this rule now — {preview.wouldFire} would be acted on.
          </p>
          {preview.matched > preview.wouldFire ? (
            <p className="mt-0.5 text-[12px] text-foreground-muted">
              The rest have already been handled for their current state, so they would be skipped.
            </p>
          ) : null}
          {preview.members.length === 0 ? (
            <p className="mt-1.5 text-[12px] text-foreground-muted">Nobody matches right now.</p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-[12px]">
              {preview.members.map((member) => (
                <li key={member.dedupeKey + member.userId} className="flex items-center gap-2">
                  <Badge tone={member.wouldFire ? "good" : "neutral"}>
                    {member.wouldFire ? "would fire" : "already done"}
                  </Badge>
                  <span className="truncate text-foreground-muted">
                    {member.handle ? `@${member.handle}` : (member.email ?? member.userId)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {preview.members.length === 50 ? (
            <p className="mt-1.5 text-[11.5px] text-foreground-muted">
              Showing the first 50 of {preview.matched}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RetryButton({ executionId }: { executionId: string }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(formData) =>
        start(async () => {
          const result = await retryExecutionAction(formData);
          if (result.ok) toast.success("Retried, and it worked this time.");
          else toast.danger(result.error);
        })
      }
    >
      <input type="hidden" name="executionId" value={executionId} />
      <AdminButton type="submit" disabled={pending} className="h-8 px-2.5 text-[12px]">
        <RotateCw className="size-3.5" aria-hidden />
        Retry
      </AdminButton>
    </form>
  );
}

export function BrokenRule({ problem }: { problem: string }) {
  return (
    <p className="flex items-start gap-1.5 text-[12.5px] text-danger">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        This rule cannot run: {problem}. It is skipped entirely rather than run in part.
      </span>
    </p>
  );
}
