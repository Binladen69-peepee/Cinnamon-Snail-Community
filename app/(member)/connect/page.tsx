import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Award,
  CalendarClock,
  Lock,
  MapPin,
  MessageSquare,
  PauseCircle,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { loadConnect, type ConnectData, type WeeklyMatch } from "@/lib/social/connect";
import { profileTabHref } from "@/lib/social/activity";
import type { RecognitionBadge, RecognitionGroup } from "@/lib/social/recognition";
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
  Overline,
  PageHeader,
  buttonClass,
  cardClass,
} from "@/components/app/ui";
import { CrewList } from "@/components/crews/crew-list";
import { crewMessage } from "@/components/crews/crew-messages";
import { messageMatchAction, respondToMatchAction, setMatchingAction } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Connect" };

const ERRORS: Record<string, string> = {
  match: "That match could not be updated. Try again.",
  matching: "That setting could not be changed. Try again.",
  profile: "Set up your profile first, then matching can find people for you.",
  busy: "That was a lot of clicks at once. Give it a moment and try again.",
  dm: "That member isn’t taking direct messages right now, so no conversation was started.",
};

/**
 * The form buttons are `PendingButton`s (they know when their form is in
 * flight), so they take the app's button construction as a class string.
 */
const primaryBtn = buttonClass({ variant: "primary" });
const quietBtn = buttonClass({ variant: "ghost", size: "sm" });

/**
 * Connect — BUILD.md §12, with Crews in place of cohorts (DEC-078).
 *
 * The weekly match, the crews the member is in or can join, and recognition.
 * People suggestions already sit on the Kitchen Table and the directory, so
 * this page points there instead of repeating them.
 *
 * What is deliberately absent, per §12.4: points, a leaderboard, anything
 * that ranks one member above another. Recognition names a thing someone did.
 */
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; joined?: string; left?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/login?callbackUrl=/connect");

  const params = await searchParams;
  // Crew actions redirect here with their own codes; the match's codes win.
  const error = params.error ? (ERRORS[params.error] ?? null) : null;
  const crewNotice = error ? null : crewMessage(params);

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
            description="A weekly match, your crews, and what members have done."
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
          ) : crewNotice ? (
            <Callout
              tone={crewNotice.tone}
              role={crewNotice.tone === "danger" ? "alert" : "status"}
            >
              {crewNotice.text}
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

            <Section
              id="crews"
              // Cohorts became crews (DEC-078); links to the old anchor still land here.
              alias="cohorts"
              icon={Users}
              title="Your crews"
              action={
                <Link
                  href="/crews"
                  className="inline-flex items-center gap-1 rounded-chip text-label font-medium text-link no-underline hover:underline"
                >
                  All crews
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            >
              <Crews crews={data.crews} />
            </Section>

            <Section id="recognition" icon={Award} title="Recognition">
              <Recognition
                data={data}
                progressHref={profileTabHref(session.user.handle, "badges")}
              />
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
  alias,
  icon: Icon,
  title,
  action,
  children,
}: {
  id: string;
  /** A retired anchor for the same section, kept so old links still land. */
  alias?: string;
  icon: LucideIcon;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="relative flex scroll-mt-20 flex-col gap-3"
    >
      {alias ? (
        <span id={alias} aria-hidden className="pointer-events-none absolute top-0 scroll-mt-20" />
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <h2
          id={`${id}-title`}
          className="flex items-center gap-2 text-title font-semibold text-foreground"
        >
          <Icon className="size-4 text-foreground-muted" aria-hidden />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function formatDay(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
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
          and a message ready to send. Only members who also opted in are matched.
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

const STATUS_LABEL: Record<WeeklyMatch["status"], string | null> = {
  SUGGESTED: null,
  SAVED: "Saved",
  PASSED: "Passed",
  CONNECTED: "Messaged",
};

/**
 * The match, and one thing to do about it: message them. The button opens the
 * conversation with the suggested message already in the box — edited or sent
 * as it is, by the member, never by us.
 */
function MatchCard({ match }: { match: WeeklyMatch }) {
  const passed = match.status === "PASSED";
  const name = firstName(match.displayName);
  const status = STATUS_LABEL[match.status];

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
        {status ? (
          <Badge tone="brand" className="shrink-0">
            {status}
          </Badge>
        ) : null}
      </div>

      <p className="mt-4 text-body text-foreground text-pretty">{match.reason}</p>

      {passed ? (
        <p className="mt-4 text-label text-foreground-muted">
          You passed on this one. A new match arrives next week.
        </p>
      ) : !match.messaging.allowed ? (
        <Callout tone="neutral" icon={<Lock />} className="mt-4" title={`${name} isn’t taking messages right now.`}>
          {match.messaging.reason} You can still say hello on their posts.
        </Callout>
      ) : (
        <>
          <div className="mt-4">
            <Overline>Suggested message</Overline>
            <p className="mt-1.5 rounded-ctl bg-surface-muted px-3 py-2.5 text-body text-foreground text-pretty">
              {match.opener}
            </p>
            <p className="mt-1.5 text-caption text-foreground-muted">
              It opens in your messages, ready to edit. Nothing is sent until you send it.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {match.status === "CONNECTED" && match.conversationId ? (
              <ButtonLink href={`/messages/${match.conversationId}`} variant="primary">
                <MessageSquare className="size-4" aria-hidden />
                Open conversation
              </ButtonLink>
            ) : (
              <form action={messageMatchAction}>
                <input type="hidden" name="matchId" value={match.id} />
                <PendingButton className={primaryBtn}>
                  <MessageSquare className="size-4" aria-hidden />
                  Message {name}
                </PendingButton>
              </form>
            )}
            {match.status !== "CONNECTED" ? (
              <form action={respondToMatchAction}>
                <input type="hidden" name="matchId" value={match.id} />
                <input type="hidden" name="status" value="PASSED" />
                <PendingButton className={quietBtn}>Not this week</PendingButton>
              </form>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}

function Crews({ crews }: { crews: ConnectData["crews"] }) {
  return (
    <div className="flex flex-col gap-4">
      {crews.mine.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="You’re not in a crew yet"
          description="You join your start-season crew, your roadmap crew and any survey crews automatically, and crews are updated once a day. Join one of the crews below in the meantime."
        />
      ) : (
        <CrewList crews={crews.mine} variant="mine" returnTo="/connect" showDescription={false} />
      )}

      {crews.joinable.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-body font-semibold text-foreground">Crews you can join</h3>
          <CrewList crews={crews.joinable} variant="joinable" returnTo="/connect" />
          <p className="text-caption text-foreground-muted">
            Open to every member. Other members can see who is in them.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Dates in UTC, as the profile's badges tab writes them. */
const EARNED_ON = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * The badge catalogue, one card per ladder (DEC-078's recognition, grouped as
 * `badge-rules.ts` defines the ladders), then any special badges, then legacy
 * awards the member holds. Progress toward the next rung is the member's own
 * and lives on their profile's badges tab, which this links to.
 */
function Recognition({ data, progressHref }: { data: ConnectData; progressHref: string }) {
  const { groups, earned, available } = data.badges;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-body font-semibold text-foreground">Your badges</h3>
            <Link
              href={progressHref}
              className="inline-flex items-center gap-1 rounded-chip text-label font-medium text-link no-underline hover:underline"
            >
              See your progress
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <p className="text-label text-foreground-muted text-pretty">
            {earned === 0
              ? "No badges yet. Share something you cooked or finish a class to earn your first."
              : `You have earned ${earned} of ${available}.`}
          </p>
        </div>
        {groups.length === 0 ? (
          <EmptyState
            icon={<Award />}
            title="No badges are set up yet"
            description="Badges recognize specific things members do, like a first cook or twenty-five helpful comments."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <BadgeGroupCard key={group.key} group={group} />
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

/**
 * One ladder as a card: its name and why it exists, how many rungs the member
 * holds, and the rungs in order, each earned (with the date and the reason in
 * their own numbers) or not yet (with what it takes).
 */
function BadgeGroupCard({ group }: { group: RecognitionGroup }) {
  const legacy = group.kind === "legacy";
  const total = group.badges.length;
  const complete = group.earned === total;

  return (
    <li className={cardClass({ padding: "none", className: "flex h-full flex-col" })}>
      <div className="flex items-start justify-between gap-3 border-b border-separator px-4 py-3">
        <div className="min-w-0">
          <h4 className="text-body font-semibold text-foreground">{group.label}</h4>
          <p className="mt-0.5 text-caption text-foreground-muted text-pretty">{group.purpose}</p>
        </div>
        {legacy ? null : (
          <Badge tone={complete ? "brand" : "neutral"} className="mt-0.5 shrink-0 tabular-nums">
            {group.earned} of {total}
            <span className="sr-only"> earned</span>
          </Badge>
        )}
      </div>
      <ul className="divide-y divide-separator">
        {group.badges.map((badge) => (
          <BadgeRow key={badge.slug} badge={badge} legacy={legacy} />
        ))}
      </ul>
    </li>
  );
}

function BadgeRow({ badge, legacy }: { badge: RecognitionBadge; legacy: boolean }) {
  const earnedAt = badge.earned ? new Date(badge.earned.awardedAt) : null;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full text-heading leading-none",
          earnedAt ? "bg-brand-wash" : "bg-default opacity-60 grayscale",
        )}
        aria-hidden
      >
        {badge.icon}
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-1.5 text-body font-semibold text-foreground">
          {badge.name}
          <span className="sr-only">{earnedAt ? ", earned" : ", not yet earned"}</span>
          {legacy ? <Badge tone="neutral">Legacy award</Badge> : null}
        </p>
        <p className="text-label text-foreground-muted text-pretty">
          {badge.earned
            ? (badge.earned.reason ?? badge.description)
            : (badge.criteria ?? badge.description)}
        </p>
        {earnedAt ? (
          <p className="mt-1 text-caption font-medium text-brand-strong">
            Earned <time dateTime={earnedAt.toISOString()}>{EARNED_ON.format(earnedAt)}</time>
          </p>
        ) : null}
      </div>
    </li>
  );
}
