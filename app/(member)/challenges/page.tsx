import Link from "next/link";
import { redirect } from "next/navigation";
import { Flag, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { listChallenges, type ChallengeCard } from "@/lib/challenges";
import { AppShell } from "@/components/app/app-shell";

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
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-[1.5rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
            Challenges
          </h1>
          <p className="mt-1 text-[14px] text-foreground-muted">
            Cook along for a few weeks. Miss a day whenever you like — the target is
            lower than the number of prompts on purpose.
          </p>
        </header>

        {challenges.length === 0 ? (
          <div className="rounded-card border border-dashed border-border bg-surface px-6 py-14 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-wash text-on-brand-wash">
              <Flag className="size-6" aria-hidden />
            </span>
            <h2 className="mt-3 font-display text-[1.15rem] font-bold text-foreground">
              Nothing running yet
            </h2>
            <p className="mx-auto mt-1.5 max-w-[44ch] text-[14px] text-foreground-muted">
              Seasonal challenges appear here when one opens. They are low-pressure by
              design: a handful of prompts, and a target you can hit while missing days.
            </p>
          </div>
        ) : null}

        <Section title="Running now" items={open} />
        <Section title="Coming up" items={upcoming} />
        <Section title="Finished" items={finished} />
      </div>
    </AppShell>
  );
}

function Section({ title, items }: { title: string; items: ChallengeCard[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-foreground-muted">
        {title}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((challenge) => (
          <li key={challenge.id}>
            <Link
              href={`/challenges/${challenge.slug}`}
              className="vu-raise block h-full overflow-hidden rounded-card border border-border bg-surface no-underline transition hover:border-brand/40"
            >
              {challenge.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={challenge.coverUrl}
                  alt=""
                  className="h-28 w-full object-cover"
                  loading="lazy"
                />
              ) : null}
              <div className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {challenge.theme ? (
                    <span className="rounded-chip bg-brand-wash px-2 py-0.5 text-[11px] font-bold text-on-brand-wash">
                      {challenge.theme}
                    </span>
                  ) : null}
                  {challenge.completed ? (
                    <span className="rounded-chip bg-brand-fill px-2 py-0.5 text-[11px] font-bold text-brand-fill-foreground">
                      Finished
                    </span>
                  ) : challenge.joined ? (
                    <span className="rounded-chip bg-default px-2 py-0.5 text-[11px] font-bold text-foreground-muted">
                      Joined
                    </span>
                  ) : null}
                </div>
                <h3 className="font-display text-[1.05rem] font-bold leading-snug text-foreground">
                  {challenge.title}
                </h3>
                {challenge.description ? (
                  <p className="line-clamp-2 text-[13px] leading-snug text-foreground-muted">
                    {challenge.description}
                  </p>
                ) : null}
                <p className="text-[12px] tabular-nums text-foreground-muted">
                  {challenge.targetCount} of {challenge.promptCount} prompts to finish ·{" "}
                  {challenge.participants} joined
                </p>
                {challenge.joined ? <Progress card={challenge} /> : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A member's own progress. Never anybody else's, and never a position. */
export function Progress({ card }: { card: ChallengeCard }) {
  const done = Math.min(card.progress, card.targetCount);
  const percent = card.targetCount > 0 ? Math.round((done / card.targetCount) * 100) : 0;
  return (
    <div className="space-y-1">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-default"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={card.targetCount}
        aria-label="Your progress"
      >
        <div className="h-full rounded-full bg-brand-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="flex items-center gap-1 text-[11.5px] tabular-nums text-foreground-muted">
        {card.completed ? <Sparkles className="size-3" aria-hidden /> : null}
        {card.progress} done
        {card.completed ? " — finished" : ` of ${card.targetCount}`}
      </p>
    </div>
  );
}
