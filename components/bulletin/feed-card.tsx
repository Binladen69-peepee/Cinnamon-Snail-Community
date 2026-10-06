"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  ArrowRight,
  CalendarDays,
  Handshake,
  MapPin,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  BULLETIN_KIND_NAME,
  BULLETIN_STATE_COPY,
  cardState,
  type BulletinCardData,
  type BulletinKind,
} from "@/lib/bulletin/card";
import { browserTimeZone, formatEventTime, safeTimeZone } from "@/lib/events/timezone";
import { Badge } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/**
 * A Bulletin Board item inside a Kitchen Table post (DEC-078).
 *
 * CONTRACT: `<BulletinFeedCard data={card} />`, with `data` from
 * `loadBulletinCards` (lib/bulletin/feed.ts). Presentational and client-safe:
 * no server imports, plain JSON props, so the feed's client post card and a
 * server page can both render it. It carries the item's own title, so the
 * post card shows it in place of the post's title and body rather than beside
 * them. It holds one link (the title, stretched over the card), so render it
 * outside any other link.
 *
 * A well rather than a card: it always sits inside the post's card, and a
 * bordered card inside a bordered card is the nesting the design system rules
 * out. A live item says where to go; one that is over says why, in words, and
 * links nowhere, because the board no longer lists it.
 */
export function BulletinFeedCard({ data }: { data: BulletinCardData }) {
  const state = cardState(data);
  const live = state === "live";
  const zone = useReaderZone(data.timeZone);
  const start = validDate(data.kind === "happening" ? data.startsAt : null);
  const ended = live ? null : BULLETIN_STATE_COPY[state];
  const standing = live ? viewerStanding(data) : null;

  return (
    <div
      className={cn(
        "relative flex gap-3 rounded-card bg-surface-muted p-3.5 sm:gap-4 sm:p-4",
        live && "group/bulletin",
      )}
    >
      {start ? (
        <DateTile start={start} zone={zone} muted={!live} />
      ) : (
        <KindTile kind={data.kind} muted={!live} />
      )}

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
          <span>{BULLETIN_KIND_NAME[data.kind]}</span>
          {data.label ? (
            <>
              <span aria-hidden>·</span>
              <span>{data.label}</span>
            </>
          ) : null}
          {standing ? (
            <Badge tone="brand" className="ml-0.5 normal-case tracking-normal">
              {standing}
            </Badge>
          ) : null}
        </p>

        <p
          className={cn(
            "mt-1 text-title font-semibold leading-snug text-pretty",
            live ? "text-foreground" : "text-foreground-muted",
          )}
        >
          {live ? (
            <Link
              href={data.href}
              className="text-foreground no-underline after:absolute after:inset-0 after:rounded-card hover:underline"
            >
              {data.title}
              <span className="sr-only">, on the Bulletin Board</span>
            </Link>
          ) : (
            data.title
          )}
        </p>

        <Meta data={data} start={start} zone={zone} live={live} />

        {live && data.summary ? (
          <p className="mt-1.5 line-clamp-2 text-body text-foreground-muted">{data.summary}</p>
        ) : null}

        {ended ? (
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone="neutral">{ended.badge}</Badge>
            <span className="text-caption text-foreground-muted">{ended.sentence}</span>
          </p>
        ) : (
          <p
            aria-hidden
            className="mt-2.5 inline-flex items-center gap-1 text-label font-medium text-link"
          >
            View on the Bulletin Board
            <ArrowRight className="size-3.5 transition-transform group-hover/bulletin:translate-x-0.5" />
          </p>
        )}
      </div>
    </div>
  );
}

const KIND_ICON: Record<BulletinKind, LucideIcon> = {
  happening: CalendarDays,
  service: Handshake,
  place: Store,
};

function KindTile({ kind, muted }: { kind: BulletinKind; muted: boolean }) {
  const Icon = KIND_ICON[kind];
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-12 shrink-0 place-items-center self-start rounded-ctl bg-brand-wash text-on-brand-wash",
        muted && "opacity-60",
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

/** The day, big, as a calendar leaf. The meta line says the full time aloud. */
function DateTile({ start, zone, muted }: { start: Date; zone: string; muted: boolean }) {
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: zone, month: "short" }).format(start);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: zone, day: "numeric" }).format(start);
  return (
    <span
      aria-hidden
      className={cn(
        "flex w-12 shrink-0 flex-col items-center self-start rounded-ctl bg-surface py-1.5 shadow-e1",
        muted && "opacity-60",
      )}
    >
      <span className="text-micro font-semibold uppercase tracking-[0.08em] text-brand-strong">
        {month}
      </span>
      <span className="text-heading font-bold leading-tight tabular-nums text-foreground">{day}</span>
    </span>
  );
}

function Meta({
  data,
  start,
  zone,
  live,
}: {
  data: BulletinCardData;
  start: Date | null;
  zone: string;
  live: boolean;
}) {
  const where = data.city ?? (data.kind === "service" && live ? "Online" : null);
  const going =
    data.kind === "happening" && live && typeof data.going === "number"
      ? `${data.going} going${typeof data.capacity === "number" ? ` of ${data.capacity}` : ""}`
      : null;
  if (!start && !where && !going) return null;

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-foreground-muted">
      {start ? (
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          <time dateTime={start.toISOString()}>{formatEventTime(start, zone)}</time>
        </span>
      ) : null}
      {where ? (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{where}</span>
        </span>
      ) : null}
      {going ? (
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Users className="size-3.5 shrink-0" aria-hidden />
          {going}
        </span>
      ) : null}
    </p>
  );
}

/** Where the reader stands with a live gathering, if anywhere. */
function viewerStanding(data: BulletinCardData): string | null {
  if (data.kind !== "happening") return null;
  if (data.isHost) return "You’re hosting";
  if (data.viewerRsvp === "approved") return "You’re going";
  if (data.viewerRsvp === "requested") return "Asked to join";
  return null;
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const subscribeToNothing = () => () => {};

/**
 * The zone to show a time in: the one saved on the reader's profile while the
 * server renders, the browser's once it hydrates. The same pair EventTime
 * uses, so the card and the board never disagree about the hour.
 */
function useReaderZone(saved: string | null | undefined): string {
  const fallback = safeTimeZone(saved);
  return useSyncExternalStore(subscribeToNothing, browserTimeZone, () => fallback);
}
