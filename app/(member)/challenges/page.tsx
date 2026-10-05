import Link from "next/link";
import { redirect } from "next/navigation";
import { Flag } from "lucide-react";
import { auth } from "@/auth";
import { listChallenges, type ChallengeCard } from "@/lib/challenges";
import { AppShell } from "@/components/app/app-shell";
import {
  Badge,
  EmptyState,
  PageHeader,
  Section,
  cardClass,
} from "@/components/app/ui";
import { ChallengeProgress } from "./challenge-progress";

export const dynamic = "force-dynamic";
export const metadata = { title: "Challenges" };

/**
 * Seasonal challenges — BUILD.md §17.
 *
 * There is no leaderboard here and no position anywhere, by design. The only
 * number against a member's name is their own progress, and the only number
 * about everybody is how many joined — which is company, not competition.
 */
export default async function ChallengesPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const challenges = await listChallenges(session.user.id);

  const open = challenges.filter((item) => item.status === "open");
  const upcoming = challenges.filter((item) => item.status === "upcoming");
  const finished = challenges.filter((item) => item.status === "finished");

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Challenges"
          description="Cook along for a few weeks. Miss a day whenever you like — the target is lower than the number of prompts on purpose."
        />

        {challenges.length === 0 ? (
          <EmptyState
            icon={<Flag />}
            title="Nothing running yet"
            description="Seasonal challenges appear here when one opens. They are low-pressure by design: a handful of prompts, and a target you can hit while missing days."
          />
        ) : null}

        <ChallengeSection title="Running now" items={open} />
        <ChallengeSection title="Coming up" items={upcoming} />
        <ChallengeSection title="Finished" items={finished} />
      </div>
    </AppShell>
  );
}

function ChallengeSection({
  title,
  items,
}: {
  title: string;
  items: ChallengeCard[];
}) {
  if (items.length === 0) return null;
  return (
    <Section title={title} count={items.length}>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((challenge) => (
          <li key={challenge.id}>
            <Link
              href={`/challenges/${challenge.slug}`}
              className={cardClass({
                padding: "none",
                interactive: true,
                className:
                  "group flex h-full flex-col overflow-hidden no-underline",
              })}
            >
              {challenge.coverUrl ? (
                <div className="h-32 overflow-hidden bg-surface-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={challenge.coverUrl}
                    alt=""
                    className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                </div>
              ) : null}
              <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
                {challenge.theme || challenge.completed || challenge.joined ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {challenge.theme ? (
                      <Badge tone="brand">{challenge.theme}</Badge>
                    ) : null}
                    {challenge.completed ? (
                      <Badge tone="success">Finished</Badge>
                    ) : challenge.joined ? (
                      <Badge tone="neutral">Joined</Badge>
                    ) : null}
                  </div>
                ) : null}
                <h3 className="text-title font-semibold text-foreground">
                  {challenge.title}
                </h3>
                {challenge.description ? (
                  <p className="line-clamp-2 text-body text-foreground-muted">
                    {challenge.description}
                  </p>
                ) : null}
                <p className="mt-auto pt-1 text-caption tabular-nums text-foreground-muted">
                  {challenge.targetCount} of {challenge.promptCount} prompts to
                  finish · {challenge.participants} joined
                </p>
                {challenge.joined ? (
                  <ChallengeProgress card={challenge} />
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
