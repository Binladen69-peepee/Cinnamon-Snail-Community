import Link from "next/link";
import { CalendarDays, Check, ChevronDown, Lock, MapPin, Plus, Users, X } from "lucide-react";
import { HAPPENING_KINDS, type HappeningView } from "@/lib/bulletin";
import { bulletinAnchor } from "@/lib/bulletin/card";
import { Avatar } from "@/components/ui/avatar";
import { PendingButton } from "@/components/ui/pending-button";
import { EventTime } from "@/components/events/event-time";
import { RichText } from "@/components/content/rich-text";
import { ZoneInput } from "@/components/bulletin/zone-input";
import { BulletinThreadBar, KitchenTableLink, type BulletinViewer } from "@/components/bulletin/thread";
import {
  Badge,
  Card,
  ChipRow,
  Input,
  Overline,
  Select,
  Textarea,
  buttonClass,
  cardClass,
  chipClass,
} from "@/components/app/ui";
import { Blank, Field, Pill, primaryBtn, quietBtn, summaryCls } from "@/components/bulletin/ui";
import {
  cancelHappeningAction,
  decideRsvpAction,
  hostHappeningAction,
  rsvpAction,
  withdrawRsvpAction,
} from "@/app/(member)/bulletin/actions";

/**
 * Happenings: gatherings members host. Only the city is ever shown to
 * everyone; the address appears for the host and approved guests. Each one is
 * also a Kitchen Table post, and its reactions and comments show here.
 */
export function HappeningsTab({
  happenings,
  kind,
  viewerZone,
  defaults,
  viewer,
}: {
  happenings: HappeningView[];
  kind: string | null;
  viewerZone: string;
  defaults: { city: string; region: string; country: string };
  viewer: BulletinViewer;
}) {
  return (
    <div className="flex flex-col gap-5">
      <HostForm viewerZone={viewerZone} defaults={defaults} />

      <nav aria-label="Kinds of gathering">
        <ChipRow>
          {[["", "All"], ...Object.entries(HAPPENING_KINDS)].map(([value, label]) => {
            const current = (kind ?? "") === value;
            return (
              <Link
                key={value || "all"}
                href={value ? `/bulletin?kind=${value}` : "/bulletin"}
                scroll={false}
                aria-current={current ? "page" : undefined}
                className={chipClass(current)}
              >
                {label}
              </Link>
            );
          })}
        </ChipRow>
      </nav>

      {happenings.length === 0 ? (
        <Blank
          icon={CalendarDays}
          title={kind ? "Nothing of this kind coming up" : "Nothing on the board yet"}
          body="Potlucks, tea, a market stall, a class in your kitchen. Host the first one and it shows up here and in the Kitchen Table."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {happenings.map((happening) => (
            <li key={happening.id}>
              <HappeningCard happening={happening} viewerZone={viewerZone} viewer={viewer} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HostForm({
  viewerZone,
  defaults,
}: {
  viewerZone: string;
  defaults: { city: string; region: string; country: string };
}) {
  return (
    <details className={cardClass({ padding: "none", className: "group" })}>
      <summary className={summaryCls}>
        <span className="inline-flex items-center gap-2.5">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash"
            aria-hidden
          >
            <Plus className="size-4" />
          </span>
          Host a gathering
        </span>
        <span className="inline-flex items-center gap-1 text-caption font-normal text-foreground-muted">
          <span className="group-open:hidden">Open</span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <form
        action={hostHappeningAction}
        className="grid grid-cols-1 gap-4 border-t border-separator p-4 sm:grid-cols-2 sm:p-5"
      >
        <ZoneInput fallback={viewerZone} />
        <p className="text-label text-foreground-muted sm:col-span-2">
          It goes on the board and into the Kitchen Table as a post, showing your city and never
          the address.
        </p>
        <Field label="What is it?" htmlFor="h-kind">
          <Select id="h-kind" name="kind" required defaultValue="potluck">
            {Object.entries(HAPPENING_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="When" htmlFor="h-when">
          <Input id="h-when" name="startsAt" type="datetime-local" required />
        </Field>
        <Field label="Title" htmlFor="h-title" className="sm:col-span-2">
          <Input id="h-title" name="title" required minLength={3} maxLength={120} placeholder="Sunday dumpling potluck" />
        </Field>
        <Field label="Details" htmlFor="h-desc" className="sm:col-span-2" hint="What to bring, who it suits, anything guests should know.">
          <Textarea id="h-desc" name="description" rows={3} maxLength={2000} />
        </Field>
        <Field label="City" htmlFor="h-city">
          <Input id="h-city" name="city" required maxLength={80} defaultValue={defaults.city} />
        </Field>
        <Field label="Region" htmlFor="h-region">
          <Input id="h-region" name="region" maxLength={80} defaultValue={defaults.region} />
        </Field>
        <Field label="Country" htmlFor="h-country">
          <Input id="h-country" name="country" maxLength={80} defaultValue={defaults.country} />
        </Field>
        <Field label="Guests" htmlFor="h-cap" hint="Leave empty for no limit.">
          <Input id="h-cap" name="capacity" type="number" min={1} max={200} />
        </Field>
        <Field
          label="Exact address"
          htmlFor="h-address"
          className="sm:col-span-2"
          hint="Stored encrypted. Only you and the guests you approve ever see it."
        >
          <Input id="h-address" name="address" maxLength={300} autoComplete="off" />
        </Field>
        <label className="flex cursor-pointer items-start gap-2.5 text-body text-foreground sm:col-span-2">
          <input type="checkbox" name="approvalRequired" defaultChecked className="mt-0.5 size-4 shrink-0" />
          <span>
            I approve each guest
            <span className="block text-caption text-foreground-muted">Keep this on for anything in your home.</span>
          </span>
        </label>
        <div className="border-t border-separator pt-4 sm:col-span-2">
          <PendingButton className={primaryBtn}>Post to the board</PendingButton>
        </div>
      </form>
    </details>
  );
}

function HappeningCard({
  happening,
  viewerZone,
  viewer,
}: {
  happening: HappeningView;
  viewerZone: string;
  viewer: BulletinViewer;
}) {
  const full = happening.capacity !== null && happening.going >= happening.capacity;
  const requests = happening.requests.filter((r) => r.status === "requested");
  const guests = happening.requests.filter((r) => r.status === "approved");

  return (
    <Card
      as="article"
      id={bulletinAnchor("happening", happening.id)}
      aria-labelledby={`${bulletinAnchor("happening", happening.id)}-title`}
      className="scroll-mt-24 target:border-brand target:shadow-e2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone="brand">{HAPPENING_KINDS[happening.kind]}</Pill>
        {happening.isHost ? <Pill>You’re hosting</Pill> : null}
        {happening.viewerRsvp === "approved" ? <Pill>You’re going</Pill> : null}
        {happening.viewerRsvp === "requested" ? <Pill>Asked to join</Pill> : null}
        {happening.thread ? (
          <KitchenTableLink postId={happening.thread.postId} title={happening.title} className="ml-auto" />
        ) : null}
      </div>
      <h3
        id={`${bulletinAnchor("happening", happening.id)}-title`}
        className="mt-2.5 text-title font-semibold text-foreground text-pretty"
      >
        {happening.title}
      </h3>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-foreground-muted">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          <EventTime
            startsAt={happening.startsAt}
            eventTimeZone={viewerZone}
            viewerTimeZone={viewerZone}
            showZone={false}
          />
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {happening.place}
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Users className="size-4 shrink-0" aria-hidden />
          {happening.going} going{happening.capacity !== null ? ` of ${happening.capacity}` : ""}
        </span>
      </p>
      {happening.description ? (
        <RichText body={happening.description} className="mt-3 text-body text-foreground" />
      ) : null}

      {happening.address ? (
        <p className="mt-3 flex items-start gap-2 rounded-ctl bg-surface-muted px-3 py-2.5 text-body text-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0 text-foreground-muted" aria-hidden />
          <span className="min-w-0">
            <span className="block text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
              Address
            </span>
            {happening.address}
          </span>
        </p>
      ) : happening.hasAddress ? (
        <p className="mt-3 flex items-center gap-1.5 text-caption text-foreground-muted">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          The address is shared with guests once the host approves them.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-separator pt-3">
        <Link
          href={`/members/${happening.host.handle}`}
          className="mr-auto flex min-w-0 items-center gap-2 text-label text-foreground-muted no-underline transition hover:text-foreground"
        >
          <Avatar name={happening.host.displayName} src={happening.host.avatarUrl} size="sm" className="size-7 text-micro" />
          <span className="min-w-0 truncate">
            Hosted by <span className="font-medium text-foreground">{happening.host.displayName}</span>
          </span>
        </Link>

        {happening.isHost ? (
          <form action={cancelHappeningAction}>
            <input type="hidden" name="happeningId" value={happening.id} />
            <PendingButton className={buttonClass({ variant: "danger", size: "sm" })}>Call it off</PendingButton>
          </form>
        ) : happening.viewerRsvp === "requested" || happening.viewerRsvp === "approved" ? (
          <form action={withdrawRsvpAction}>
            <input type="hidden" name="happeningId" value={happening.id} />
            <PendingButton className={quietBtn}>
              {happening.viewerRsvp === "approved" ? "I can’t make it" : "Withdraw request"}
            </PendingButton>
          </form>
        ) : happening.viewerRsvp === "declined" ? (
          <span className="text-caption text-foreground-muted">The host couldn’t fit you in this time.</span>
        ) : full ? (
          <Badge>Full</Badge>
        ) : (
          <form action={rsvpAction}>
            <input type="hidden" name="happeningId" value={happening.id} />
            <PendingButton className={primaryBtn}>
              {happening.approvalRequired ? "Ask to join" : "I’m coming"}
            </PendingButton>
          </form>
        )}
      </div>

      {happening.isHost && (requests.length > 0 || guests.length > 0) ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-separator pt-3">
          {requests.length > 0 ? <Overline>Waiting for you · {requests.length}</Overline> : null}
          <ul className="flex flex-col gap-2">
            {[...requests, ...guests].map((request) => (
              <li key={request.rsvpId} className="flex flex-wrap items-center gap-2">
                <Avatar name={request.person.displayName} src={request.person.avatarUrl} size="sm" className="size-7 text-micro" />
                <Link
                  href={`/members/${request.person.handle}`}
                  className="mr-auto min-w-0 truncate text-label font-medium text-foreground no-underline hover:underline"
                >
                  {request.person.displayName}
                </Link>
                {request.status === "requested" ? (
                  <>
                    <form action={decideRsvpAction}>
                      <input type="hidden" name="rsvpId" value={request.rsvpId} />
                      <input type="hidden" name="decision" value="approve" />
                      <PendingButton className={buttonClass({ variant: "primary", size: "sm" })}>
                        <Check className="size-3.5" aria-hidden />
                        Approve
                      </PendingButton>
                    </form>
                    <form action={decideRsvpAction}>
                      <input type="hidden" name="rsvpId" value={request.rsvpId} />
                      <input type="hidden" name="decision" value="decline" />
                      <PendingButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                        <X className="size-3.5" aria-hidden />
                        Decline
                      </PendingButton>
                    </form>
                  </>
                ) : (
                  <Badge tone="success">Coming</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <BulletinThreadBar thread={happening.thread} viewer={viewer} />
    </Card>
  );
}
