import { AlertTriangle, Flag } from "lucide-react";
import { loadAdminChallenges } from "@/lib/admin/challenges";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  type BadgeTone,
} from "@/components/app/ui";
import {
  NewChallengeForm,
  PromptEditor,
  PublishToggle,
} from "@/components/admin/challenge-console";

export const dynamic = "force-dynamic";
export const metadata = { title: "Challenges" };

/** Where a challenge is in its own calendar, as a badge says it. */
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  upcoming: { label: "Upcoming", tone: "info" },
  open: { label: "Open", tone: "brand" },
  finished: { label: "Finished", tone: "neutral" },
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Authoring seasonal challenges — BUILD.md §17.
 *
 * Challenges arrive unpublished, and publishing refuses a target above the
 * number of prompts, which would be a challenge nobody could finish. There is
 * no leaderboard here either: the console shows how many joined and how many
 * finished, never who is ahead.
 */
export default async function AdminChallengesPage() {
  const challenges = await loadAdminChallenges();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Challenges"
        description="Seasonal and low-pressure. The target sits below the number of prompts on purpose."
      />

      <Card padding="none">
        <CardHeader title="All challenges" icon={<Flag />} count={challenges.length} />
        <div className="border-b border-separator bg-surface-muted/50 px-4 py-3 sm:px-5">
          <NewChallengeForm />
        </div>

        {challenges.length === 0 ? (
          <EmptyState
            bordered={false}
            icon={<Flag />}
            title="No challenges yet"
            description="A challenge is a theme, a handful of daily prompts and a target that is comfortably below them."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {challenges.map((challenge) => {
              const status = STATUS[challenge.status] ?? {
                label: challenge.status,
                tone: "neutral" as const,
              };
              return (
                <li key={challenge.id} className="flex flex-col gap-4 px-4 py-4 sm:px-5">
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-body font-semibold text-foreground">{challenge.title}</h3>
                        <Badge tone={challenge.published ? "success" : "neutral"}>
                          {challenge.published ? "Published" : "Draft"}
                        </Badge>
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {challenge.theme ? <Badge tone="outline">{challenge.theme}</Badge> : null}
                      </div>
                      <p className="mt-1 text-label text-foreground-muted">
                        {formatDate(challenge.startsAt)} – {formatDate(challenge.endsAt)} ·{" "}
                        {challenge.targetCount} of {challenge.promptCount} prompts finishes it
                        {challenge.spaceName ? ` · posts to ${challenge.spaceName}` : ""}
                      </p>
                      <p className="mt-0.5 text-caption tabular-nums text-foreground-muted">
                        {challenge.joined} joined · {challenge.finished} finished
                        {challenge.badgeSlug ? ` · badge ${challenge.badgeSlug}` : ""}
                        {challenge.kitTag ? ` · Kit "${challenge.kitTag}"` : ""}
                      </p>
                      {challenge.targetCount > challenge.promptCount ? (
                        <p className="mt-1.5 flex items-start gap-1.5 text-caption font-medium text-danger">
                          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                          <span>
                            The target is above the number of prompts, so nobody could finish it.
                            Publishing is refused until that is fixed.
                          </span>
                        </p>
                      ) : null}
                    </div>
                    <PublishToggle challengeId={challenge.id} published={challenge.published} />
                  </div>

                  <PromptEditor challengeId={challenge.id} prompts={challenge.prompts} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
