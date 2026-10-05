import { Bot, CalendarClock, History, Inbox, ShieldAlert } from "lucide-react";
import { dayName, loadCohostConsole } from "@/lib/admin/cohost";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
  type BadgeTone,
} from "@/components/app/ui";
import {
  BulkApprove,
  DraftCard,
  NewScheduleForm,
  ScheduleControls,
} from "@/components/admin/cohost-queue";
import { formatShortTime } from "@/lib/community/format-count";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI cohost" };

/** How a decided draft ended. */
const DECIDED_TONE: Record<string, BadgeTone> = {
  published: "success",
  failed: "danger",
  rejected: "neutral",
};

/** A stored status ("published") as a badge says it ("Published"). */
function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI cohost"
        description="Prompts written by Claude, published only once you approve them."
      />

      {!data.configured ? (
        <Callout tone="warning" icon={<ShieldAlert />} title="No model key.">
          Set{" "}
          <code className="rounded-chip bg-default px-1 py-px font-mono text-caption text-foreground">
            ANTHROPIC_API_KEY
          </code>{" "}
          to let the cohost write. Everything else here — the queue, approvals and publishing —
          works without it.
        </Callout>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Waiting for review" value={data.counts.pending} />
        <Stat label="Approved" value={data.counts.approved} />
        <Stat label="Published" value={data.counts.published} />
        <Stat label="Rejected" value={data.counts.rejected} />
      </dl>

      <Card padding="none">
        <CardHeader title="Schedules" icon={<CalendarClock />} count={data.schedules.length} />
        <div className="border-b border-separator bg-surface-muted/50 px-4 py-3 sm:px-5">
          <NewScheduleForm />
        </div>
        {data.schedules.length === 0 ? (
          <EmptyState
            size="sm"
            bordered={false}
            icon={<CalendarClock />}
            title="No schedules yet"
            description="A schedule says which space the cohost writes for, who it posts as, and on which days. None exists yet, so nothing is being generated."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {data.schedules.map((schedule) => (
              <li
                key={schedule.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-body font-semibold text-foreground">{schedule.name}</h3>
                    <Badge tone={schedule.paused ? "neutral" : "success"}>
                      {schedule.paused ? "Paused" : "Running"}
                    </Badge>
                    {schedule.pending > 0 ? (
                      <Badge tone="warning">{schedule.pending} waiting</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-label text-foreground-muted">
                    {schedule.spaceName ?? "No space set"} · posts as{" "}
                    {schedule.authorHandle ? `@${schedule.authorHandle}` : "nobody yet"} ·{" "}
                    {schedule.days.map(dayName).join(", ")} at {schedule.defaultTime} ({schedule.timezone})
                  </p>
                  {schedule.autoPauseReason ? (
                    <p className="mt-1 text-caption font-medium text-warning">
                      Paused itself: {schedule.autoPauseReason}
                    </p>
                  ) : null}
                  <p className="mt-1 text-caption text-foreground-muted">
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
      </Card>

      <Card padding="none">
        <CardHeader
          title="Waiting for review"
          icon={<Inbox />}
          count={data.queue.length}
          action={<BulkApprove draftIds={waiting.map((draft) => draft.id)} />}
        />
        {data.queue.length === 0 ? (
          <EmptyState
            size="sm"
            bordered={false}
            icon={<Bot />}
            title="Nothing to review"
            description="When the cohost writes, its drafts arrive here. Nothing is published until you approve it."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {data.queue.map((draft) => (
              <DraftCard key={draft.id} draft={draft} />
            ))}
          </ul>
        )}
      </Card>

      {data.recent.length > 0 ? (
        <Card padding="none">
          <CardHeader title="Recently decided" icon={<History />} count={data.recent.length} />
          <ul className="divide-y divide-separator">
            {data.recent.map((draft) => (
              <li
                key={draft.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-body leading-snug text-foreground">{draft.text}</p>
                  {draft.rejectionReason ? (
                    <p className="mt-0.5 text-caption text-foreground-muted">{draft.rejectionReason}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {draft.engagement ? (
                    <span className="text-caption tabular-nums text-foreground-muted">
                      {draft.engagement.comments} repl{draft.engagement.comments === 1 ? "y" : "ies"} ·{" "}
                      {draft.engagement.reactions} reaction{draft.engagement.reactions === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  <Badge tone={DECIDED_TONE[draft.status] ?? "neutral"}>
                    {statusLabel(draft.status)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
