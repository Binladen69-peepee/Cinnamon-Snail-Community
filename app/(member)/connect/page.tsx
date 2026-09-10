import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ensureNewMemberCohort, cohortsForUser } from "@/lib/social/cohorts";
import { ensureWeeklyMatch, peopleYouShouldMeet } from "@/lib/social/suggestions";
import { recentRecognition } from "@/lib/social/badges";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  respondToMatchAction,
  updateMatchingAction,
} from "@/app/(member)/connect/actions";

export const metadata = { title: "Connect · Vegan University" };

export default async function ConnectPage() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");
  const userId = session.user.id;

  // Joining a cohort is automatic; visiting this page is the natural moment.
  await ensureNewMemberCohort(userId);

  const [match, suggestions, cohorts, recognition, profile] = await Promise.all([
    ensureWeeklyMatch(userId),
    peopleYouShouldMeet(userId),
    cohortsForUser(userId),
    recentRecognition(5),
    prisma.profile.findUnique({
      where: { userId },
      select: { matchingOptIn: true, matchingPausedUntil: true },
    }),
  ]);

  const paused =
    profile?.matchingPausedUntil && profile.matchingPausedUntil > new Date()
      ? profile.matchingPausedUntil
      : null;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-4xl text-forest">Connect</h1>
        <p className="mt-3 max-w-prose text-muted">
          The people here are the point. Every suggestion below says why it was
          made, so you can ignore the ones that miss.
        </p>
      </header>

      <section aria-labelledby="weekly-match">
        <h2 id="weekly-match" className="font-display text-2xl text-forest">
          This week&rsquo;s match
        </h2>
        {!profile?.matchingOptIn ? (
          <p className="mt-4 rounded-2xl border border-dashed border-sand px-4 py-6 text-sm text-muted">
            Weekly matching is off. Turn it back on below whenever you want it.
          </p>
        ) : paused ? (
          <p className="mt-4 rounded-2xl border border-dashed border-sand px-4 py-6 text-sm text-muted">
            Matching is paused until {paused.toLocaleDateString()}.
          </p>
        ) : match ? (
          <article className="vu-card mt-4 p-6">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar
                name={match.matchedUser.profile?.displayName ?? match.matchedUser.handle}
                src={match.matchedUser.profile?.avatarUrl}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-2xl text-forest">
                  {match.matchedUser.profile?.displayName ?? match.matchedUser.handle}
                </h3>
                <p className="text-sm text-muted">@{match.matchedUser.handle}</p>
                <p className="mt-3 text-[0.95rem]">{match.reason}</p>
                <p className="mt-2 rounded-2xl bg-sage/40 px-4 py-3 text-sm text-forest">
                  {match.starter}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <ButtonLink
                    href={`/messages/new?to=${match.matchedUser.handle}`}
                    size="sm"
                  >
                    Say hello
                  </ButtonLink>
                  <form action={respondToMatchAction}>
                    <input type="hidden" name="matchId" value={match.id} />
                    <input type="hidden" name="status" value="PASSED" />
                    <button
                      type="submit"
                      className="rounded-full border border-sand px-4 py-2 text-sm text-olive hover:border-accent"
                    >
                      Not this week
                    </button>
                  </form>
                  {match.status !== "SUGGESTED" ? (
                    <span className="text-xs uppercase tracking-wide text-olive">
                      {match.status.toLowerCase()}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-sand px-4 py-6 text-sm text-muted">
            No match this week. As more members fill in what they cook, this gets
            better.
          </p>
        )}
      </section>

      <section aria-labelledby="people">
        <h2 id="people" className="font-display text-2xl text-forest">
          People you should meet
        </h2>
        {suggestions.length === 0 ? (
          <EmptyState
            title="Nothing to suggest yet"
            body="Add your cooking interests and join a space or two — suggestions are built from what you have in common with people."
            actionLabel="Edit your profile"
            actionHref="/settings"
          />
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {suggestions.map((person) => (
              <li key={person.userId} className="vu-card vu-card-hover p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={person.displayName} src={person.avatarUrl} />
                  <div className="min-w-0">
                    <Link
                      href={`/members/${person.handle}`}
                      className="block truncate font-semibold text-forest no-underline hover:underline"
                    >
                      {person.displayName}
                    </Link>
                    <p className="truncate text-xs text-muted">
                      {person.city ?? `@${person.handle}`}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm">{person.reason}</p>
                <p className="mt-2 text-sm text-olive">{person.starter}</p>
                <ButtonLink
                  href={`/messages/new?to=${person.handle}`}
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                >
                  Message
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cohorts">
        <h2 id="cohorts" className="font-display text-2xl text-forest">
          Your cohorts
        </h2>
        {cohorts.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            You are not in a cohort yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {cohorts.map(({ cohort }) => (
              <li key={cohort.id} className="vu-card p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-xl text-forest">{cohort.name}</h3>
                  <span className="text-xs text-muted">
                    {cohort._count.members}{" "}
                    {cohort._count.members === 1 ? "member" : "members"}
                  </span>
                </div>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="font-semibold text-olive">Introduce yourself</dt>
                    <dd>{cohort.introPrompt}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-olive">First cook</dt>
                    <dd>{cohort.firstCook}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-olive">Goal</dt>
                    <dd>{cohort.goal}</dd>
                  </div>
                </dl>
                {cohort.space ? (
                  <ButtonLink
                    href={`/spaces/${cohort.space.slug}`}
                    variant="secondary"
                    size="sm"
                    className="mt-4"
                  >
                    Open cohort space
                  </ButtonLink>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recognition">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="recognition" className="font-display text-2xl text-forest">
            Recent recognition
          </h2>
          <Link href="/connect/recognition" className="text-sm text-olive underline-offset-2 hover:underline">
            All badges
          </Link>
        </div>
        {recognition.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No badges awarded yet. They arrive for real work, not for logging in.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {recognition.map((award) => (
              <li key={award.id} className="vu-card flex items-center gap-3 p-4">
                <span aria-hidden className="text-2xl">
                  {award.badge.icon ?? "🌱"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <Link
                      href={`/members/${award.user.handle}`}
                      className="font-semibold text-forest no-underline hover:underline"
                    >
                      {award.user.profile?.displayName ?? award.user.handle}
                    </Link>{" "}
                    earned <span className="font-semibold">{award.badge.name}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {award.reason ?? award.badge.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="matching-prefs" className="vu-card p-6">
        <h2 id="matching-prefs" className="font-display text-xl text-forest">
          Matching preferences
        </h2>
        <p className="mt-2 text-sm text-muted">
          Matching is opt-in and you can pause it any time.
        </p>
        <form action={updateMatchingAction} className="mt-4 space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="matchingOptIn"
              defaultChecked={profile?.matchingOptIn ?? true}
              className="size-4 accent-[var(--accent)]"
            />
            Suggest a weekly match for me
          </label>
          <label className="block text-sm">
            Pause for
            <select
              name="pauseWeeks"
              defaultValue="0"
              className="mt-2 min-h-11 w-full rounded-2xl border border-sand bg-surface px-4"
            >
              <option value="0">Not paused</option>
              <option value="2">Two weeks</option>
              <option value="4">A month</option>
              <option value="12">Three months</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-white dark:bg-surface dark:text-foreground dark:ring-1 dark:ring-border"
          >
            Save preferences
          </button>
        </form>
      </section>
    </div>
  );
}
