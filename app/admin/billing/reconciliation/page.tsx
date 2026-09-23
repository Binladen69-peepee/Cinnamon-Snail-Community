import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function ReconciliationPage() {
  const runs = await prisma.reconciliationRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { findings: true },
  });
  return (
    <div className="space-y-6">
      <Link href="/admin/billing" className="text-sm text-foreground-muted">
        Back to billing
      </Link>
      <h1 className="font-display text-[1.55rem] font-bold tracking-[-0.02em] text-foreground">Reconciliation report</h1>
      {runs.length === 0 ? (
        <p className="text-foreground-muted">No nightly run has been stored yet.</p>
      ) : (
        <ul className="space-y-4">
          {runs.map((run) => (
            <li key={run.id} className="rounded-[1.5rem] border border-border bg-surface p-5">
              <p className="font-medium text-foreground">
                {run.status} · {run.startedAt.toDateString()}
              </p>
              <p className="mt-1 text-sm text-foreground-muted">
                {run.findings.length} findings ·{" "}
                {run.findings.filter((item) => item.autoFixed).length} auto-fixed
                {run.emailSentAt ? " · alert email sent" : ""}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {run.findings.map((finding) => (
                  <li key={finding.id}>
                    {finding.kind.replaceAll("_", " ")} ({finding.severity})
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
