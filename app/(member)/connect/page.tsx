import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Award,
  Bookmark,
  CalendarClock,
  MapPin,
  MessageSquare,
  PauseCircle,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { loadConnect, type ConnectData, type WeeklyMatch } from "@/lib/social/connect";
import { AppShell } from "@/components/app/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { PendingButton } from "@/components/ui/pending-button";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  buttonClass,
  cardClass,
} from "@/components/app/ui";
import { respondToMatchAction, setMatchingAction } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Connect" };

const ERRORS: Record<string, string> = {
  match: "That match could not be updated. Try again.",
  matching: "That setting could not be changed. Try again.",
  profile: "Set up your profile first, then matching can find people for you.",
  busy: "That was a lot of clicks at once. Give it a moment and try again.",
};

/**
 * The form buttons are `PendingButton`s (they know when their form is in
 * flight), so they take the app's button construction as a class string.
 */
const primaryBtn = buttonClass({ variant: "primary" });
const secondaryBtn = buttonClass({ variant: "secondary" });
const quietBtn = buttonClass({ variant: "ghost", size: "sm" });

/**
 * Connect — BUILD.md §12.
 *
 * The weekly match, the cohorts you were placed in, and recognition. People
 * suggestions already sit on Explorer and the directory, so this page
 * points there instead of repeating them.
 *
 * What is deliberately absent, per §12.4: points, a leaderboard, anything
 * that ranks one member above another. Recognition names a thing someone did.
 */
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/connect");

  const params = await searchParams;
  const error = params.error ? (ERRORS[params.error] ?? null) : null;

  let data: ConnectData | null = null;
  try {
    data = await loadConnect(session.user.id);
  } catch (cause) {
    console.error("[connect] load failed", cause);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-6">
          <PageHeader
            title="Connect"
            description="A weekly match, the people you started with, and what members have done."
            actions={
              <ButtonLink href="/members">
                <Users className="size-4" aria-hidden />
                Browse members
              </ButtonLink>
            }
          />

          {error ? (
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          ) : null}
        </div>

        {!data ? (
          <ErrorState
            title="Connect didn’t load"
            description="Something went wrong on our side. Reload the page in a moment."
            action={<ButtonLink href="/connect">Reload</ButtonLink>}
          />
        ) : (
          <>
            <Section id="match" icon={Sparkles} title="This week’s match">
              <MatchPanel data={data} />
            </Section>

            <Section id="cohorts" icon={Users} title="Your cohorts">
              <Cohorts cohorts={data.cohorts} />
            </Section>

            <Section id="recognition" icon={Award} title="Recognition">
              <Recognition data={data} />
            </Section>
          </>
        )}
      </div>
    </AppShell>
  );
}

/**
 * A page section with an anchor. Composed here rather than with the shared
 * `Section` because notifications link to `#recognition` and the heading
 * needs an id for `aria-labelledby`; it takes `SectionHeader`'s type.
 */
function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-3">
      <h2
        id={`${id}-title`}
        className="flex items-center gap-2 text-title font-semibold text-foreground"
      >
        <Icon className="size-4 text-foreground-muted" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function MatchPanel({ data }: { data: ConnectData }) {
  const { matching, match } = data;

  if (matching.kind === "no-profile") {
    return (
      <EmptyState
        icon={<Sparkles />}
        title="Matching needs a profile"
        description="Matches are drawn from what you cook and what you want to learn. Fill in your profile and a match arrives each week."
        action={
          <ButtonLink href="/settings" variant="primary">
            Set up your profile
          </ButtonLink>
        }
      />
    );
  }

  if (matching.kind === "off") {
    return (
      <Card>
        <p className="text-body font-semibold text-foreground">Weekly matching is off.</p>
        <p className="mt-1 text-body text-foreground-muted text-pretty">
          Turn it on and each Monday you get one member to meet, with the reason you were paired
          and a line to open with. Only members who also opted in are matched.
        </p>
        <form action={setMatchingAction} className="mt-4">
          <input type="hidden" name="mode" value="on" />
          <PendingButton className={primaryBtn}>Turn on matching</PendingButton>
        </form>
      </Card>
    );
  }

  if (matching.kind === "paused") {
    return (
      <Card>
        <p className="flex items-center gap-2 text-body font-semibold text-foreground">
          <PauseCircle className="size-4 text-foreground-muted" aria-hidden />
          Matching is paused until {formatDay(matching.until)}.
        </p>
        <p className="mt-1 text-body text-foreground-muted">
          No new match is drawn while you are paused.
        </p>
        <form action={setMatchingAction} className="mt-4">
          <input type="hidden" name="mode" value="on" />
          <PendingButton className={primaryBtn}>Resume now</PendingButton>
        </form>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {match ? (
        <MatchCard match={match} />
      ) : (
        <EmptyState
          icon={<Sparkles />}
          title="No match this week"
          description="Nobody who opted in is a good fit right now, or you have met everyone recently. We try again next week."
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-label text-foreground-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="size-4" aria-hidden />
          Next match {formatDay(data.nextMatchAt)}
        </span>
        <span className="-mr-2 flex items-center gap-1">
          <form action={setMatchingAction}>
            <input type="hidden" name="mode" value="pause" />
            <PendingButton className={quietBtn}>Pause two weeks</PendingButton>
          </form>
          <form action={setMatchingAction}>
            <input type="hidden" name="mode" value="off" />
            <PendingButton className={quietBtn}>Turn off</PendingButton>
          </form>
        </span>
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: WeeklyMatch }) {
  const passed = match.status === "PASSED";
  return (
    <Card className={cn(passed && "opacity-75")}>
      <div className="flex items-start gap-3">
        <Link href={`/members/${match.handle}`} className="shrink-0 no-underline" tabIndex={-1} aria-hidden>
          <Avatar name={match.displayName} src={match.avatarUrl} size="md" />
        </Link>
        <div className="min-w-0 flex-1 pt-0.5">
          <Link
            href={`/members/${match.handle}`}
            className="text-title font-semibold text-foreground no-underline hover:underline"
          >
            {match.displayName}
          </Link>
          <p className="flex flex-wrap items-center gap-x-2 text-label text-foreground-muted">
            <span>@{match.handle}</span>
            {match.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {match.city}
              </span>
            ) : null}
          </p>
        </div>
        {match.status !== "SUGGESTED" ? (
          <Badge tone="brand" className="shrink-0">
            {match.status === "SAVED" ? "Saved" : match.status === "PASSED" ? "Passed" : "Messaged"}
          </Badge>
        ) : null}
      </div>

      <p className="mt-4 text-body text-foreground text-pretty">{match.reason}</p>
      <p className="mt-2 rounded-ctl bg-surface-muted px-3 py-2.5 text-body italic text-foreground-muted">
        “{match.starter}”
      </p>

      {passed ? (
        <p className="mt-4 text-label text-foreground-muted">
          You passed on this one. A new match arrives next week.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={respondToMatchAction}>
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="status" value="CONNECTED" />
            <PendingButton className={primaryBtn}>
              <MessageSquare className="size-4" aria-hidden />
              Say hello
            </PendingButton>
          </form>
          {match.status === "SUGGESTED" ? (
            <form action={respondToMatchAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="status" value="SAVED" />
              <PendingButton className={secondaryBtn}>
                <Bookmark className="size-4" aria-hidden />
                Save for later
              </PendingButton>
            </form>
          ) : null}
          {match.status !== "CONNECTED" ? (
            <form action={respondToMatchAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="status" value="PASSED" />
              <PendingButton className={secondaryBtn}>
                <X className="size-4" aria-hidden />
                Pass
              </PendingButton>
            </form>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function Cohorts({ cohorts }: { cohorts: ConnectData["cohorts"] }) {
  if (cohorts.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="You are not in a cohort yet"
        description="Cohorts form around the week you joined or the week you start a course, each with its own small private room."
        action={<ButtonLink href="/learn">Browse courses</ButtonLink>}
      />
    );
  }

  // One card, a row per cohort: a list of the same kind of thing.
  return (
    <Card padding="none">
      <ul className="divide-y divide-separator">
        {cohorts.map(({ cohort }) => (
          <li key={cohort.id} className="px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body font-semibold text-foreground">{cohort.name}</p>
                <p className="text-label text-foreground-muted">
                  {cohort._count.members} {cohort._count.members === 1 ? "member" : "members"}
                  {cohort.course ? ` · ${cohort.course.title}` : ""}
                </p>
              </div>
              {cohort.space ? (
                <ButtonLink href={`/spaces/${cohort.space.slug}`} size="sm">
                  Open the room
                </ButtonLink>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-body sm:grid-cols-3">
              {[
                ["Say hello", cohort.introPrompt],
                ["First cook", cohort.firstCook],
                ["Goal", cohort.goal],
              ].map(([label, value]) => (
                <div key={label} className="rounded-ctl bg-surface-muted px-3 py-2.5">
                  <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                    {label}
                  </dt>
                  <dd className="mt-1 text-label text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Recognition({ data }: { data: ConnectData }) {
  const earned = data.badges.filter((badge) => badge.earned);
  const toEarn = data.badges.filter((badge) => !badge.earned);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-label font-medium text-foreground-muted">
          {earned.length === 0
            ? "Your badges will appear here."
            : `You have earned ${earned.length} of ${data.badges.length}.`}
        </p>
        {data.badges.length === 0 ? (
          <EmptyState
            icon={<Award />}
            title="No badges are set up yet"
            description="Badges recognize specific things members do, like a first cook or twenty-five helpful comments."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[...earned, ...toEarn].map((badge) => (
              <li
                key={badge.slug}
                className={
                  badge.earned
                    ? cardClass({ padding: "sm", className: "flex h-full items-start gap-3" })
                    : "flex h-full items-start gap-3 rounded-card border border-dashed border-hairline-firm p-3"
                }
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full text-heading leading-none",
                    badge.earned ? "bg-brand-wash" : "bg-surface-muted opacity-50 grayscale",
                  )}
                  aria-hidden
                >
                  {badge.icon ?? "★"}
                </span>
                <div className="min-w-0">
                  <p className="text-body font-semibold text-foreground">
                    {badge.name}
                    <span className="sr-only">{badge.earned ? ", earned" : ", not yet earned"}</span>
                  </p>
                  <p className="text-label text-foreground-muted">
                    {badge.earned
                      ? (badge.earned.reason ?? badge.description)
                      : (badge.criteria ?? badge.description)}
                  </p>
                  {badge.earned ? (
                    <p className="mt-1 text-caption font-medium text-brand-strong">
                      Earned{" "}
                      {badge.earned.awardedAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-body font-semibold text-foreground">Recently recognized</h3>
        {data.recognition.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<Award />}
            title="Nobody has earned a badge yet."
            description="The first one goes to whoever shares a first cook."
          />
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-separator">
              {data.recognition.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar name={row.displayName} src={row.avatarUrl} size="sm" className="shrink-0" />
                  <p className="min-w-0 flex-1 text-body text-foreground">
                    <Link href={`/members/${row.handle}`} className="font-semibold text-foreground no-underline hover:underline">
                      {row.displayName}
                    </Link>{" "}
                    earned{" "}
                    <span className="font-semibold">
                      {row.badgeIcon ? `${row.badgeIcon} ` : ""}
                      {row.badgeName}
                    </span>
                    {row.reason ? (
                      <span className="block truncate text-label text-foreground-muted">{row.reason}</span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
