"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Eye, Play, RotateCw } from "lucide-react";
import { Badge, Button } from "@/components/app/ui";
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
      <Button
        type="submit"
        variant={paused ? "primary" : "danger"}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? "Working…" : paused ? "Resume automations" : "Pause all automations"}
      </Button>
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={enabledForm}>
          <input type="hidden" name="slug" value={rule.slug} />
          <input type="hidden" name="enabled" value={rule.enabled ? "0" : "1"} />
          <Button
            type="submit"
            size="sm"
            variant={rule.enabled ? "secondary" : "primary"}
            disabled={pending || Boolean(rule.problem)}
          >
            {rule.enabled ? "Turn off" : "Turn on"}
          </Button>
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
          <Button type="submit" size="sm" disabled={pending}>
            <Eye className="size-3.5" aria-hidden />
            Dry run
          </Button>
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
          <Button
            type="submit"
            size="sm"
            disabled={pending || !rule.enabled || Boolean(rule.problem)}
          >
            <Play className="size-3.5" aria-hidden />
            Run now
          </Button>
        </form>
      </div>

      {preview?.ok ? (
        <div className="rounded-ctl bg-surface-muted p-3 sm:p-4">
          <p className="text-label font-medium text-foreground">
            {preview.matched} match this rule now — {preview.wouldFire} would be acted on.
          </p>
          {preview.matched > preview.wouldFire ? (
            <p className="mt-0.5 text-caption text-foreground-muted">
              The rest have already been handled for their current state, so they would be skipped.
            </p>
          ) : null}
          {preview.members.length === 0 ? (
            <p className="mt-1.5 text-caption text-foreground-muted">Nobody matches right now.</p>
          ) : (
            <ul className="mt-2.5 flex max-h-48 flex-col gap-1.5 overflow-y-auto text-caption">
              {preview.members.map((member) => (
                <li key={member.dedupeKey + member.userId} className="flex min-w-0 items-center gap-2">
                  <Badge tone={member.wouldFire ? "success" : "neutral"}>
                    {member.wouldFire ? "Would fire" : "Already done"}
                  </Badge>
                  <span className="truncate text-foreground-muted">
                    {member.handle ? `@${member.handle}` : (member.email ?? member.userId)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {preview.members.length === 50 ? (
            <p className="mt-2 text-caption text-foreground-muted">
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
      <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined}>
        <RotateCw className="size-3.5" aria-hidden />
        Retry
      </Button>
    </form>
  );
}

export function BrokenRule({ problem }: { problem: string }) {
  return (
    <p className="flex items-start gap-2 text-label text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        This rule cannot run: {problem}. It is skipped entirely rather than run in part.
      </span>
    </p>
  );
}
