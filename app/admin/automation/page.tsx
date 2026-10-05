import { CircuitBoard, History, ListChecks, PauseCircle } from "lucide-react";
import { loadAutomationConsole } from "@/lib/admin/automation";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/app/ui";
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Automation"
        description="Rules that watch for something and act on it. Every rule starts off."
        actions={<PauseAllSwitch paused={data.paused} />}
      />

      {data.paused ? (
        <Callout tone="warning" icon={<PauseCircle />} title="Everything is paused.">
          No rule will act, including the nightly run. Dry runs still work, so you can keep
          checking what would happen.
        </Callout>
      ) : null}

      <Card padding="none">
        <CardHeader
          title="Rules"
          icon={<CircuitBoard />}
          count={data.rules.length}
          action={
            data.missingRules > 0 ? (
              <form action={seedMissingRulesAction}>
                <Button type="submit" variant="primary" size="sm">
                  Add {data.missingRules} missing
                </Button>
              </form>
            ) : null
          }
        />
        {data.rules.length === 0 ? (
          <EmptyState
            bordered={false}
            icon={<ListChecks />}
            title="No rules yet"
            description="The fourteen rules from the plan can be added here. They arrive switched off, so nothing is sent until you turn one on."
            action={
              <form action={seedMissingRulesAction}>
                <Button type="submit" variant="primary">
                  Add the standard rules
                </Button>
              </form>
            }
          />
        ) : (
          <ul className="divide-y divide-separator">
            {data.rules.map((rule) => (
              <li key={rule.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-body font-semibold text-foreground">{rule.name}</h3>
                      <Badge tone={rule.enabled ? "success" : "neutral"}>
                        {rule.enabled ? "On" : "Off"}
                      </Badge>
                      {rule.problem ? <Badge tone="danger">Broken</Badge> : null}
                    </div>
                    {rule.description ? (
                      <p className="mt-1 max-w-[70ch] text-label leading-snug text-foreground-muted">
                        {rule.description}
                      </p>
                    ) : null}
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-caption text-foreground-muted">
                      <span className="font-semibold text-foreground">When:</span> {rule.triggerLabel}
                      {rule.actionSummary.length > 0 ? (
                        <>
                          <span className="font-semibold text-foreground">· Then:</span>
                          {rule.actionSummary.join(", ")}
                        </>
                      ) : null}
                    </p>
                  </div>
                  {/* Left-aligned under the title on a phone, a right-hand
                      column from sm up. */}
                  <div className="shrink-0 text-caption tabular-nums text-foreground-muted sm:text-right">
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
      </Card>

      <Card padding="none" className="overflow-hidden">
        <CardHeader title="Recent activity" icon={<History />} count={data.recent.length} />
        {data.recent.length === 0 ? (
          <EmptyState
            size="sm"
            bordered={false}
            icon={<History />}
            title="Nothing has run yet"
            description="Once a rule is on, every member it acts on is listed here with what happened."
          />
        ) : (
          <Table
            head={
              <>
                <Th>Rule</Th>
                <Th className="hidden sm:table-cell">Member</Th>
                <Th>Result</Th>
                <Th className="hidden text-right md:table-cell">When</Th>
              </>
            }
          >
            {data.recent.map((row) => (
              <Tr key={row.id}>
                <Td className="align-top">
                  <span className="font-medium text-foreground">{row.ruleName}</span>
                  {/* On a phone the hidden columns fold in under the rule. */}
                  <span className="mt-0.5 block text-caption tabular-nums text-foreground-muted md:hidden">
                    <span className="sm:hidden">{row.handle ? `@${row.handle} · ` : ""}</span>
                    {formatShortTime(row.createdAt)}
                  </span>
                </Td>
                <Td className="hidden align-top sm:table-cell">
                  <span className="text-foreground-muted">
                    {row.handle ? `@${row.handle}` : "—"}
                  </span>
                </Td>
                <Td className="align-top">
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge tone={row.success ? "success" : "danger"}>
                      {row.success ? "Done" : "Failed"}
                    </Badge>
                    <span className="min-w-0 max-w-[48ch] flex-1 text-caption leading-snug text-foreground-muted">
                      {row.detail}
                    </span>
                    {!row.success ? <RetryButton executionId={row.id} /> : null}
                  </div>
                </Td>
                <Td className="hidden text-right align-top md:table-cell">
                  <time
                    dateTime={row.createdAt.toISOString()}
                    className="whitespace-nowrap text-caption tabular-nums text-foreground-muted"
                  >
                    {formatShortTime(row.createdAt)}
                  </time>
                </Td>
              </Tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
