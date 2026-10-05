import { Flag } from "lucide-react";
import { loadAdminChallenges } from "@/lib/admin/challenges";
import { Badge, EmptyPanel, PageHeader, Panel, PanelHeader } from "@/components/admin/ui";
import {
  NewChallengeForm,
  PromptEditor,
  PublishToggle,
} from "@/components/admin/challenge-console";

export const dynamic = "force-dynamic";
export const metadata = { title: "Challenges" };

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
    <div className="space-y-5 py-2">
      <PageHeader
        title="Challenges"
        subtitle="Seasonal and low-pressure. The target sits below the number of prompts on purpose."
      />

      <Panel>
        <PanelHeader
          title="All challenges"
          icon={<Flag className="size-3.5" aria-hidden />}
          count={challenges.length}
        />
        <div className="border-b border-separator px-4 py-3">
          <NewChallengeForm />
        </div>

        {challenges.length === 0 ? (
          <EmptyPanel
            icon={<Flag className="size-6" aria-hidden />}
            title="No challenges yet"
            body="A challenge is a theme, a handful of daily prompts and a target that is comfortably below them."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {challenges.map((challenge) => (
              <li key={challenge.id} className="space-y-3 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14px] font-bold text-foreground">{challenge.title}</h3>
                      <Badge tone={challenge.published ? "good" : "neutral"}>
                        {challenge.published ? "Published" : "Draft"}
                      </Badge>
                      <Badge tone="neutral">{challenge.status}</Badge>
                      {challenge.theme ? <Badge tone="solid">{challenge.theme}</Badge> : null}
                    </div>
                    <p className="mt-1 text-[12.5px] text-foreground-muted">
                      {challenge.startsAt.toLocaleDateString()} –{" "}
                      {challenge.endsAt.toLocaleDateString()} · {challenge.targetCount} of{" "}
                      {challenge.promptCount} prompts finishes it
                      {challenge.spaceName ? ` · posts to ${challenge.spaceName}` : ""}
                    </p>
                    <p className="mt-0.5 text-[11.5px] tabular-nums text-foreground-muted">
                      {challenge.joined} joined · {challenge.finished} finished
                      {challenge.badgeSlug ? ` · badge ${challenge.badgeSlug}` : ""}
                      {challenge.kitTag ? ` · Kit "${challenge.kitTag}"` : ""}
                    </p>
                    {challenge.targetCount > challenge.promptCount ? (
                      <p className="mt-1 text-[12px] text-danger">
                        The target is above the number of prompts, so nobody could finish it.
                        Publishing is refused until that is fixed.
                      </p>
                    ) : null}
                  </div>
                  <PublishToggle challengeId={challenge.id} published={challenge.published} />
                </div>

                <PromptEditor challengeId={challenge.id} prompts={challenge.prompts} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
