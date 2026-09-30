import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Award,
  Bookmark,
  CalendarClock,
  Handshake,
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
import { respondToMatchAction, setMatchingAction } from "./actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Connect" };

const ERRORS: Record<string, string> = {
  match: "That match could not be updated. Try again.",
  matching: "That setting could not be changed. Try again.",
  profile: "Set up your profile first, then matching can find people for you.",
  busy: "That was a lot of clicks at once. Give it a moment and try again.",
};

const primaryBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-ctl bg-brand-fill px-3.5 text-[13.5px] font-semibold text-brand-fill-foreground no-underline transition hover:opacity-90";
const quietBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-ctl border border-border bg-background px-3.5 text-[13.5px] font-semibold text-foreground no-underline transition hover:border-hairline-firm";

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
      <div className="space-y-7 pb-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-[-0.02em] text-foreground">
              Connect
            </h1>
            <p className="mt-1 text-[14px] text-foreground-muted">
              A weekly match, the people you started with, and what members have done.
            </p>
          </div>
          <Link href="/members" className={quietBtn}>
            <Users className="size-4" aria-hidden />
            Browse members
          </Link>
        </header>

        {error ? (
          <p
            role="alert"
            className="rounded-ctl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[13.5px] font-semibold text-danger"
          >
            {error}
          </p>
        ) : null}

        {!data ? (
          <Blank
            icon={Handshake}
            title="Connect didn’t load"
            body="Something went wrong on our side. Reload the page in a moment."
            action={{ href: "/connect", label: "Reload" }}
            tone="danger"
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
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 space-y-2.5">
      <h2
        id={`${id}-title`}
        className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted"
      >
        <Icon className="size-3" aria-hidden />
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
      <Blank
        icon={Sparkles}
        title="Matching needs a profile"
        body="Matches are drawn from what you cook and what you want to learn. Fill in your profile and a match arrives each week."
        action={{ href: "/settings", label: "Set up your profile" }}
      />
    );
  }

  if (matching.kind === "off") {
    return (
      <Card>
        <p className="text-[14.5px] font-semibold text-foreground">Weekly matching is off.</p>
        <p className="mt-1 text-[13.5px] text-foreground-muted">
          Turn it on and each Monday you get one member to meet, with the reason you were paired
          and a line to open with. Only members who also opted in are matched.
        </p>
        <form action={setMatchingAction} className="mt-3">
          <input type="hidden" name="mode" value="on" />
          <PendingButton className={primaryBtn}>Turn on matching</PendingButton>
        </form>
      </Card>
    );
  }

  if (matching.kind === "paused") {
    return (
      <Card>
        <p className="flex items-center gap-1.5 text-[14.5px] font-semibold text-foreground">
          <PauseCircle className="size-4 text-foreground-muted" aria-hidden />
          Matching is paused until {formatDay(matching.until)}.
        </p>
        <p className="mt-1 text-[13.5px] text-foreground-muted">
          No new match is drawn while you are paused.
        </p>
        <form action={setMatchingAction} className="mt-3">
          <input type="hidden" name="mode" value="on" />
          <PendingButton className={primaryBtn}>Resume now</PendingButton>
        </form>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {match ? (
        <MatchCard match={match} />
      ) : (
        <Blank
          icon={Sparkles}
          title="No match this week"
          body="Nobody who opted in is a good fit right now, or you have met everyone recently. We try again next week."
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[12.5px] text-foreground-muted">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3.5" aria-hidden />
          Next match {formatDay(data.nextMatchAt)}
        </span>
        <span className="flex items-center gap-3">
          <form action={setMatchingAction}>
            <input type="hidden" name="mode" value="pause" />
            <PendingButton className="inline-flex items-center gap-1 font-semibold text-foreground-muted underline-offset-2 hover:text-foreground hover:underline">
              Pause two weeks
            </PendingButton>
          </form>
          <form action={setMatchingAction}>
            <input type="hidden" name="mode" value="off" />
            <PendingButton className="inline-flex items-center gap-1 font-semibold text-foreground-muted underline-offset-2 hover:text-foreground hover:underline">
              Turn off
            </PendingButton>
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
          <Avatar name={match.displayName} src={match.avatarUrl} size="md" className="size-12" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/members/${match.handle}`}
            className="text-[15px] font-bold text-foreground no-underline hover:underline"
          >
            {match.displayName}
          </Link>
          <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-foreground-muted">
            <span>@{match.handle}</span>
            {match.city ? (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="size-3" aria-hidden />
                {match.city}
              </span>
            ) : null}
          </p>
        </div>
        {match.status !== "SUGGESTED" ? (
          <span className="shrink-0 rounded-full bg-brand-wash px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-on-brand-wash">
            {match.status === "SAVED" ? "Saved" : match.status === "PASSED" ? "Passed" : "Messaged"}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-[14px] text-foreground">{match.reason}</p>
      <p className="mt-2 rounded-ctl bg-surface-muted px-3 py-2 text-[13.5px] italic text-foreground-muted">
        “{match.starter}”
      </p>

      {passed ? (
        <p className="mt-3 text-[13px] text-foreground-muted">
          You passed on this one. A new match arrives next week.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
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
              <PendingButton className={quietBtn}>
                <Bookmark className="size-4" aria-hidden />
                Save for later
              </PendingButton>
            </form>
          ) : null}
          {match.status !== "CONNECTED" ? (
            <form action={respondToMatchAction}>
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="status" value="PASSED" />
              <PendingButton className={quietBtn}>
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
      <Blank
        icon={Users}
        title="You are not in a cohort yet"
        body="Cohorts form around the week you joined or the week you start a course, each with its own small private room."
        action={{ href: "/learn", label: "Browse courses" }}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {cohorts.map(({ cohort }) => (
        <li key={cohort.id}>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-foreground">{cohort.name}</p>
                <p className="text-[12.5px] text-foreground-muted">
                  {cohort._count.members} {cohort._count.members === 1 ? "member" : "members"}
                  {cohort.course ? ` · ${cohort.course.title}` : ""}
                </p>
              </div>
              {cohort.space ? (
                <Link href={`/spaces/${cohort.space.slug}`} className={quietBtn}>
                  Open the room
                </Link>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-[13.5px] sm:grid-cols-3">
              {[
                ["Say hello", cohort.introPrompt],
                ["First cook", cohort.firstCook],
                ["Goal", cohort.goal],
              ].map(([label, value]) => (
                <div key={label} className="rounded-ctl bg-surface-muted px-3 py-2">
                  <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Recognition({ data }: { data: ConnectData }) {
  const earned = data.badges.filter((badge) => badge.earned);
  const toEarn = data.badges.filter((badge) => !badge.earned);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-foreground">
          {earned.length === 0
            ? "Your badges will appear here."
            : `You have earned ${earned.length} of ${data.badges.length}.`}
        </p>
        {data.badges.length === 0 ? (
          <Blank
            icon={Award}
            title="No badges are set up yet"
            body="Badges recognize specific things members do, like a first cook or twenty-five helpful comments."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[...earned, ...toEarn].map((badge) => (
              <li
                key={badge.slug}
                className={cn(
                  "flex items-start gap-3 rounded-card border bg-surface p-3",
                  badge.earned ? "border-hairline-firm" : "border-dashed border-border",
                )}
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full bg-surface-muted text-[20px] leading-none",
                    !badge.earned && "opacity-45 grayscale",
                  )}
                  aria-hidden
                >
                  {badge.icon ?? "★"}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-foreground">
                    {badge.name}
                    <span className="sr-only">{badge.earned ? ", earned" : ", not yet earned"}</span>
                  </p>
                  <p className="text-[12.5px] leading-snug text-foreground-muted">
                    {badge.earned
                      ? (badge.earned.reason ?? badge.description)
                      : (badge.criteria ?? badge.description)}
                  </p>
                  {badge.earned ? (
                    <p className="mt-0.5 text-[11.5px] font-semibold text-foreground-muted">
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

      <div className="space-y-2">
        <h3 className="text-[13px] font-semibold text-foreground">Recently recognized</h3>
        {data.recognition.length === 0 ? (
          <p className="rounded-card border border-dashed border-border bg-surface px-4 py-6 text-center text-[13.5px] text-foreground-muted">
            Nobody has earned a badge yet. The first one goes to whoever shares a first cook.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {data.recognition.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Avatar name={row.displayName} src={row.avatarUrl} size="sm" className="shrink-0" />
                <p className="min-w-0 flex-1 text-[13.5px] text-foreground">
                  <Link href={`/members/${row.handle}`} className="font-semibold text-foreground no-underline hover:underline">
                    {row.displayName}
                  </Link>{" "}
                  earned{" "}
                  <span className="font-semibold">
                    {row.badgeIcon ? `${row.badgeIcon} ` : ""}
                    {row.badgeName}
                  </span>
                  {row.reason ? (
                    <span className="block truncate text-[12.5px] text-foreground-muted">{row.reason}</span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-card border border-border bg-surface p-4", className)}>{children}</div>
  );
}

function Blank({
  icon: Icon,
  title,
  body,
  action,
  tone = "neutral",
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { href: string; label: string };
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className="rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center"
    >
      <span
        className={cn(
          "mx-auto grid size-11 place-items-center rounded-full",
          tone === "danger" ? "bg-danger/10 text-danger" : "bg-brand-wash text-on-brand-wash",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="mt-3 font-display text-[1.05rem] font-bold text-foreground">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] text-foreground-muted">{body}</p>
      {action ? (
        <Link href={action.href} className={cn(quietBtn, "mt-4")}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
