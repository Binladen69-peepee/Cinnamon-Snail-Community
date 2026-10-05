import { FileClock } from "lucide-react";
import { prisma } from "@/lib/db";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  type BadgeTone,
} from "@/components/app/ui";

export const metadata = { title: "Reconciliation" };

/** How a nightly run ended, said in words with a tone to match. */
const RUN_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  clean: { label: "Clean", tone: "success" },
  drift: { label: "Drift", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  running: { label: "Running", tone: "info" },
};

/** A finding's severity: fixed on its own, or waiting for a person. */
const SEVERITY: Record<string, { label: string; tone: BadgeTone }> = {
  auto_fix: { label: "Auto-fix", tone: "neutral" },
  alert: { label: "Alert", tone: "warning" },
};

function runStatus(status: string) {
  return RUN_STATUS[status] ?? { label: status, tone: "neutral" as const };
}

function severity(value: string) {
  return SEVERITY[value] ?? { label: value.replaceAll("_", " "), tone: "neutral" as const };
}

/**
 * Every stored nightly reconciliation, newest first: how it ended, what it
 * found, and what it fixed by itself. One card of runs, each run a row, its
 * findings listed under it rather than in a card of their own.
 */
export default async function ReconciliationPage() {
  const runs = await prisma.reconciliationRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { findings: true },
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        back={{ href: "/admin/billing", label: "Back to billing" }}
        title="Reconciliation report"
      />
      {runs.length === 0 ? (
        <EmptyState
          icon={<FileClock />}
          title="No runs yet"
          description="No nightly run has been stored yet."
        />
      ) : (
        <Card padding="none" as="div">
          <ul className="divide-y divide-separator">
            {runs.map((run) => {
              const status = runStatus(run.status);
              const autoFixed = run.findings.filter((item) => item.autoFixed).length;
              return (
                <li key={run.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <p className="text-body font-semibold text-foreground">
                      {run.startedAt.toDateString()}
                    </p>
                    <p className="text-label text-foreground-muted">
                      {run.findings.length} findings · {autoFixed} auto-fixed
                      {run.emailSentAt ? " · alert email sent" : ""}
                    </p>
                  </div>

                  {run.findings.length > 0 ? (
                    <ul className="divide-y divide-separator rounded-ctl bg-surface-muted">
                      {run.findings.map((finding) => {
                        const level = severity(finding.severity);
                        return (
                          <li
                            key={finding.id}
                            className="flex items-center justify-between gap-3 px-3 py-2"
                          >
                            <span className="min-w-0 truncate text-label text-foreground first-letter:uppercase">
                              {finding.kind.replaceAll("_", " ")}
                            </span>
                            <Badge tone={level.tone}>{level.label}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
