import { Bot, CalendarClock, Inbox, ShieldAlert } from "lucide-react";
import { dayName, loadCohostConsole } from "@/lib/admin/cohost";
import {
  Badge,
  EmptyPanel,
  PageHeader,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/admin/ui";
import {
  BulkApprove,
  DraftCard,
  NewScheduleForm,
  ScheduleControls,
} from "@/components/admin/cohost-queue";
import { formatShortTime } from "@/lib/community/format-count";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI cohost" };

/**
 * The cohost console — BUILD.md §16.
 *
 * Drafts the model wrote, waiting for a person. Nothing on this page publishes
 * by itself: approving is what sets a publish time, and the job only ever
 * looks at approved drafts.
 */
export default async function CohostPage() {
  const data = await loadCohostConsole();
  const waiting = data.queue.filter((draft) => draft.status === "pending");

  return (
    <div className="space-y-5 py-2">
      <PageHeader
        title="AI cohost"
        subtitle="Prompts written by Claude, published only once you approve them."
      />

      {!data.configured ? (
        <Panel className="border-warning/40 bg-warning/8">
          <div className="flex items-start gap-2.5 px-4 py-3">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-[13px] text-foreground">
              <strong className="font-bold">No model key.</strong> Set{" "}
              <code className="rounded bg-default px-1">ANTHROPIC_API_KEY</code> to let the cohost
              write. Everything else here — the queue, approvals and publishing — works without it.
            </p>
          </div>
        </Panel>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Waiting for review" value={String(data.counts.pending)} />
        <Stat label="Approved" value={String(data.counts.approved)} />
        <Stat label="Published" value={String(data.counts.published)} />
        <Stat label="Rejected" value={String(data.counts.rejected)} />
      </div>

      <Panel>
        <PanelHeader
          title="Schedules"
          icon={<CalendarClock className="size-3.5" aria-hidden />}
          count={data.schedules.length}
        />
        <div className="border-b border-separator px-4 py-3">
          <NewScheduleForm />
        </div>
        {data.schedules.length === 0 ? (
          <EmptyPanel
            icon={<CalendarClock className="size-6" aria-hidden />}
            title="No schedules yet"
            body="A schedule says which space the cohost writes for, who it posts as, and on which days. None exists yet, so nothing is being generated."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {data.schedules.map((schedule) => (
              <li key={schedule.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-bold text-foreground">{schedule.name}</h3>
                    <Badge tone={schedule.paused ? "neutral" : "good"}>
                      {schedule.paused ? "Paused" : "Running"}
                    </Badge>
                    {schedule.pending > 0 ? (
                      <Badge tone="warn">{schedule.pending} waiting</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[12.5px] text-foreground-muted">
                    {schedule.spaceName ?? "No space set"} · posts as{" "}
                    {schedule.authorHandle ? `@${schedule.authorHandle}` : "nobody yet"} ·{" "}
                    {schedule.days.map(dayName).join(", ")} at {schedule.defaultTime} ({schedule.timezone})
                  </p>
                  {schedule.autoPauseReason ? (
                    <p className="mt-1 text-[12px] text-warning">
                      Paused itself: {schedule.autoPauseReason}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11.5px] text-foreground-muted">
                    Keeps {schedule.draftCount} drafts ready ·{" "}
                    {schedule.lastGeneratedAt
                      ? `last wrote ${formatShortTime(schedule.lastGeneratedAt)}`
                      : "has not written yet"}
                  </p>
                </div>
                <ScheduleControls schedule={schedule} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Waiting for review"
          icon={<Inbox className="size-3.5" aria-hidden />}
          count={data.queue.length}
          action={<BulkApprove draftIds={waiting.map((draft) => draft.id)} />}
        />
        {data.queue.length === 0 ? (
          <EmptyPanel
            icon={<Bot className="size-6" aria-hidden />}
            title="Nothing to review"
            body="When the cohost writes, its drafts arrive here. Nothing is published until you approve it."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {data.queue.map((draft) => (
              <DraftCard key={draft.id} draft={draft} />
            ))}
          </ul>
        )}
      </Panel>

      {data.recent.length > 0 ? (
        <Panel>
          <PanelHeader title="Recently decided" count={data.recent.length} />
          <ul className="divide-y divide-separator">
            {data.recent.map((draft) => (
              <li key={draft.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] leading-snug text-foreground">{draft.text}</p>
                  {draft.rejectionReason ? (
                    <p className="mt-0.5 text-[12px] text-foreground-muted">{draft.rejectionReason}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {draft.engagement ? (
                    <span className="text-[11.5px] tabular-nums text-foreground-muted">
                      {draft.engagement.comments} repl{draft.engagement.comments === 1 ? "y" : "ies"} ·{" "}
                      {draft.engagement.reactions} reaction{draft.engagement.reactions === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  <Badge tone={draft.status === "published" ? "good" : draft.status === "failed" ? "bad" : "neutral"}>
                    {draft.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
