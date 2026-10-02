import { CircuitBoard, History, ListChecks, PauseCircle } from "lucide-react";
import { loadAutomationConsole } from "@/lib/admin/automation";
import {
  AdminButton,
  Badge,
  EmptyPanel,
  PageHeader,
  Panel,
  PanelHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/admin/ui";
import {
  BrokenRule,
  PauseAllSwitch,
  RetryButton,
  RuleControls,
} from "@/components/admin/automation-console";
import { seedMissingRulesAction } from "@/app/admin/automation/actions";
import { formatShortTime } from "@/lib/community/format-count";

export const dynamic = "force-dynamic";
export const metadata = { title: "Automation" };

/**
 * The automation console — BUILD.md §15's required controls, on one page.
 *
 * Rules arrive switched off. Nothing here sends anything until somebody turns
 * a rule on, and "Dry run" exists so that decision is made after seeing
 * exactly who it would reach.
 */
export default async function AutomationPage() {
  const data = await loadAutomationConsole();

  return (
    <div className="space-y-5 py-2">
      <PageHeader
        title="Automation"
        subtitle="Rules that watch for something and act on it. Every rule starts off."
        actions={<PauseAllSwitch paused={data.paused} />}
      />

      {data.paused ? (
        <Panel className="border-warning/40 bg-warning/8">
          <div className="flex items-start gap-2.5 px-4 py-3">
            <PauseCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-[13px] text-foreground">
              <strong className="font-bold">Everything is paused.</strong> No rule will act,
              including the nightly run. Dry runs still work, so you can keep checking what
              would happen.
            </p>
          </div>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          title="Rules"
          icon={<CircuitBoard className="size-3.5" aria-hidden />}
          count={data.rules.length}
          action={
            data.missingRules > 0 ? (
              <form action={seedMissingRulesAction}>
                <AdminButton type="submit" variant="primary" className="h-8 px-3 text-[12px]">
                  Add {data.missingRules} missing
                </AdminButton>
              </form>
            ) : null
          }
        />
        {data.rules.length === 0 ? (
          <EmptyPanel
            icon={<ListChecks className="size-6" aria-hidden />}
            title="No rules yet"
            body="The fourteen rules from the plan can be added here. They arrive switched off, so nothing is sent until you turn one on."
            action={
              <form action={seedMissingRulesAction}>
                <AdminButton type="submit" variant="primary">
                  Add the standard rules
                </AdminButton>
              </form>
            }
          />
        ) : (
          <ul className="divide-y divide-separator">
            {data.rules.map((rule) => (
              <li key={rule.id} className="space-y-3 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14px] font-bold text-foreground">{rule.name}</h3>
                      <Badge tone={rule.enabled ? "good" : "neutral"}>
                        {rule.enabled ? "On" : "Off"}
                      </Badge>
                      {rule.problem ? <Badge tone="bad">Broken</Badge> : null}
                    </div>
                    {rule.description ? (
                      <p className="mt-1 max-w-[70ch] text-[12.5px] leading-snug text-foreground-muted">
                        {rule.description}
                      </p>
                    ) : null}
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-foreground-muted">
                      <span className="font-semibold">When:</span> {rule.triggerLabel}
                      {rule.actionSummary.length > 0 ? (
                        <>
                          <span className="font-semibold">· Then:</span>
                          {rule.actionSummary.join(", ")}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="text-right text-[11.5px] tabular-nums text-foreground-muted">
                    <div>
                      {rule.fired} acted on
                      {rule.failed > 0 ? <span className="text-danger"> · {rule.failed} failed</span> : null}
                    </div>
                    <div>
                      {rule.lastRunAt ? `Last run ${formatShortTime(rule.lastRunAt)}` : "Never run"}
                    </div>
                  </div>
                </div>

                {rule.problem ? <BrokenRule problem={rule.problem} /> : <RuleControls rule={rule} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Recent activity"
          icon={<History className="size-3.5" aria-hidden />}
          count={data.recent.length}
        />
        {data.recent.length === 0 ? (
          <EmptyPanel
            icon={<History className="size-6" aria-hidden />}
            title="Nothing has run yet"
            body="Once a rule is on, every member it acts on is listed here with what happened."
          />
        ) : (
          <Table
            head={
              <>
                <Th>Rule</Th>
                <Th>Member</Th>
                <Th>Result</Th>
                <Th className="text-right">When</Th>
              </>
            }
          >
            {data.recent.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <span className="text-[13px] font-semibold text-foreground">{row.ruleName}</span>
                </Td>
                <Td>
                  <span className="text-[12.5px] text-foreground-muted">
                    {row.handle ? `@${row.handle}` : "—"}
                  </span>
                </Td>
                <Td>
                  <div className="flex items-start gap-2">
                    <Badge tone={row.success ? "good" : "bad"}>
                      {row.success ? "Done" : "Failed"}
                    </Badge>
                    <span className="max-w-[48ch] text-[12px] leading-snug text-foreground-muted">
                      {row.detail}
                    </span>
                    {!row.success ? <RetryButton executionId={row.id} /> : null}
                  </div>
                </Td>
                <Td className="text-right">
                  <time
                    dateTime={row.createdAt.toISOString()}
                    className="text-[11.5px] tabular-nums text-foreground-muted"
                  >
                    {formatShortTime(row.createdAt)}
                  </time>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
