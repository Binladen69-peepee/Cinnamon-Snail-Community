import { Award } from "lucide-react";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ProgressBar,
} from "@/components/app/ui";
import type {
  BadgeProgressView,
  BadgeShowcase,
  EarnedBadgeView,
} from "@/lib/social/badge-rules";

/** Dates in UTC, so the server's render and the browser's agree. */
const EARNED_ON = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * The Badges tab.
 *
 * Earned badges for everyone, with the date and the reason in the member's
 * own numbers. For the member themself, the next rung of every ladder with a
 * progress bar ("3 of 5 replies"), and the ladders not yet started. Progress
 * is never shown to anyone else, and nothing here is ranked.
 */
export function BadgeShowcaseView({
  showcase,
  isOwner,
  displayName,
}: {
  showcase: BadgeShowcase;
  isOwner: boolean;
  displayName: string;
}) {
  const { earned, inProgress, toStart } = showcase;

  return (
    <div className="flex flex-col gap-4">
      {isOwner ? (
        <p className="text-label text-foreground-muted text-pretty">
          Badges count things you have really done here, in short ladders, so there is
          always a next one in reach. Only you see your progress; other members see what
          you have earned.
        </p>
      ) : null}

      <Card padding="none">
        <CardHeader
          title="Earned"
          icon={<Award />}
          count={earned.length}
        />
        {earned.length === 0 ? (
          <EmptyState
            size="sm"
            bordered={false}
            icon={<Award />}
            title="No badges yet"
            description={
              isOwner
                ? "Your first is close: share something you cooked, or reply to another member's post."
                : `${displayName} hasn’t earned a badge yet.`
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 sm:p-5">
            {earned.map((badge) => (
              <EarnedBadge key={badge.slug} badge={badge} />
            ))}
          </ul>
        )}
      </Card>

      {isOwner && inProgress.length > 0 ? (
        <Card padding="none">
          <CardHeader
            title="In progress"
            description="The next badge on every ladder you have started, closest first."
          />
          <ul className="divide-y divide-separator">
            {inProgress.map((badge) => (
              <ProgressRow key={badge.slug} badge={badge} />
            ))}
          </ul>
        </Card>
      ) : null}

      {isOwner && toStart.length > 0 ? (
        <Card padding="none">
          <CardHeader
            title="Still to start"
            description="The first rung of each ladder you have not begun yet."
          />
          <ul className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 sm:p-5">
            {toStart.map((badge) => (
              <li key={badge.slug} className="flex items-start gap-3 rounded-ctl bg-surface-muted p-3">
                <BadgeMark icon={badge.icon} muted />
                <div className="min-w-0">
                  <p className="text-body font-semibold text-foreground">{badge.name}</p>
                  <p className="text-caption text-foreground-muted">{badge.familyLabel}</p>
                  <p className="mt-1 text-label text-foreground-muted">{badge.criteria}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function BadgeMark({ icon, muted = false }: { icon: string; muted?: boolean }) {
  return (
    <span
      className={
        muted
          ? "grid size-10 shrink-0 place-items-center rounded-full bg-default text-heading leading-none opacity-60 grayscale"
          : "grid size-10 shrink-0 place-items-center rounded-full bg-brand-wash text-heading leading-none"
      }
      aria-hidden
    >
      {icon}
    </span>
  );
}

function tierLine(badge: { familyLabel: string | null; tier: number | null; tiers: number | null }) {
  if (!badge.familyLabel || !badge.tier || !badge.tiers) return null;
  return badge.tiers > 1
    ? `${badge.familyLabel} · tier ${badge.tier} of ${badge.tiers}`
    : badge.familyLabel;
}

function EarnedBadge({ badge }: { badge: EarnedBadgeView }) {
  const line = tierLine(badge);
  const at = new Date(badge.awardedAt);
  return (
    <li
      id={`badge-${badge.slug}`}
      className="flex scroll-mt-24 items-start gap-3 rounded-ctl bg-surface-muted p-3 target:ring-2 target:ring-brand"
    >
      <BadgeMark icon={badge.icon} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-body font-semibold text-foreground">
          {badge.name}
          {badge.legacy ? <Badge tone="neutral">Legacy award</Badge> : null}
        </p>
        {line ? <p className="text-caption text-foreground-muted">{line}</p> : null}
        <p className="mt-1 text-label text-foreground-muted text-pretty">
          {badge.reason ?? badge.description}
        </p>
        <p className="mt-1 text-caption font-medium text-brand-strong">
          Earned <time dateTime={at.toISOString()}>{EARNED_ON.format(at)}</time>
        </p>
      </div>
    </li>
  );
}

function ProgressRow({ badge }: { badge: BadgeProgressView }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <BadgeMark icon={badge.icon} muted />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-body font-semibold text-foreground">{badge.name}</p>
          <p className="text-caption font-medium tabular-nums text-foreground-muted">
            {badge.progressLabel}
          </p>
        </div>
        <p className="text-caption text-foreground-muted">
          {tierLine(badge) ?? badge.familyLabel}
        </p>
        <ProgressBar
          value={badge.current}
          max={badge.target}
          label={`${badge.name}: ${badge.progressLabel}`}
          size="sm"
          className="mt-2"
        />
        <p className="mt-1.5 text-label text-foreground-muted text-pretty">{badge.criteria}</p>
      </div>
    </li>
  );
}

/** The aside's strip: the latest few, each opening its place on the tab. */
export function BadgeStrip({
  earned,
  onOpen,
}: {
  earned: EarnedBadgeView[];
  onOpen: (slug: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-3 px-4 py-4">
      {earned.slice(0, 4).map((badge) => (
        <li key={badge.slug}>
          <button
            type="button"
            onClick={() => onOpen(badge.slug)}
            className="group flex w-17 flex-col items-center gap-1.5 rounded-ctl text-center"
            title={badge.name}
          >
            <BadgeMark icon={badge.icon} />
            <span className="line-clamp-2 text-micro text-foreground-muted transition group-hover:text-foreground">
              {badge.name}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
