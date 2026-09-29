import Link from "next/link";
import { CalendarDays, Check, Lock, MapPin, Plus, Users, X } from "lucide-react";
import { HAPPENING_KINDS, type HappeningView } from "@/lib/bulletin";
import { Avatar } from "@/components/ui/avatar";
import { PendingButton } from "@/components/ui/pending-button";
import { EventTime } from "@/components/events/event-time";
import { ZoneInput } from "@/components/bulletin/zone-input";
import {
  Blank,
  Field,
  fieldCls,
  linkBtn,
  Pill,
  primaryBtn,
  quietBtn,
  summaryCls,
} from "@/components/bulletin/ui";
import {
  cancelHappeningAction,
  decideRsvpAction,
  hostHappeningAction,
  rsvpAction,
  withdrawRsvpAction,
} from "@/app/(member)/bulletin/actions";
import { cn } from "@/lib/utils";

/**
 * Happenings: gatherings members host. Only the city is ever shown to
 * everyone; the address appears for the host and approved guests.
 */
export function HappeningsTab({
  happenings,
  kind,
  viewerZone,
  defaults,
}: {
  happenings: HappeningView[];
  kind: string | null;
  viewerZone: string;
  defaults: { city: string; region: string; country: string };
}) {
  return (
    <div className="space-y-4">
      <HostForm viewerZone={viewerZone} defaults={defaults} />

      <nav aria-label="Kinds of gathering" className="-mx-3 px-3 sm:mx-0 sm:px-0">
        <ul className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[["", "All"], ...Object.entries(HAPPENING_KINDS)].map(([value, label]) => {
            const current = (kind ?? "") === value;
            return (
              <li key={value || "all"}>
                <Link
                  href={value ? `/bulletin?kind=${value}` : "/bulletin"}
                  scroll={false}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold no-underline transition",
                    current
                      ? "border-brand-fill bg-brand-fill text-brand-fill-foreground"
                      : "border-border bg-surface text-foreground-muted hover:border-hairline-firm hover:text-foreground",
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {happenings.length === 0 ? (
        <Blank
          icon={CalendarDays}
          title={kind ? "Nothing of this kind coming up" : "Nothing on the board yet"}
          body="Potlucks, tea, a market stall, a class in your kitchen. Host the first one and it shows up here for members nearby."
        />
      ) : (
        <ul className="space-y-2.5">
          {happenings.map((happening) => (
            <li key={happening.id}>
              <HappeningCard happening={happening} viewerZone={viewerZone} />
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
    <details className="group">
      <summary className={summaryCls}>
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4" aria-hidden />
          Host a gathering
        </span>
        <span className="text-[12px] font-normal text-foreground-muted group-open:hidden">Open</span>
      </summary>
      <form action={hostHappeningAction} className="mt-2 grid grid-cols-1 gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2">
        <ZoneInput fallback={viewerZone} />
        <Field label="What is it?" htmlFor="h-kind">
          <select id="h-kind" name="kind" required defaultValue="potluck" className={fieldCls}>
            {Object.entries(HAPPENING_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="When" htmlFor="h-when">
          <input id="h-when" name="startsAt" type="datetime-local" required className={fieldCls} />
        </Field>
        <Field label="Title" htmlFor="h-title" className="sm:col-span-2">
          <input id="h-title" name="title" required minLength={3} maxLength={120} placeholder="Sunday dumpling potluck" className={fieldCls} />
        </Field>
        <Field label="Details" htmlFor="h-desc" className="sm:col-span-2" hint="What to bring, who it suits, anything guests should know.">
          <textarea id="h-desc" name="description" rows={3} maxLength={2000} className={fieldCls} />
        </Field>
        <Field label="City" htmlFor="h-city">
          <input id="h-city" name="city" required maxLength={80} defaultValue={defaults.city} className={fieldCls} />
        </Field>
        <Field label="Region" htmlFor="h-region">
          <input id="h-region" name="region" maxLength={80} defaultValue={defaults.region} className={fieldCls} />
        </Field>
        <Field label="Country" htmlFor="h-country">
          <input id="h-country" name="country" maxLength={80} defaultValue={defaults.country} className={fieldCls} />
        </Field>
        <Field label="Guests" htmlFor="h-cap" hint="Leave empty for no limit.">
          <input id="h-cap" name="capacity" type="number" min={1} max={200} className={fieldCls} />
        </Field>
        <Field
          label="Exact address"
          htmlFor="h-address"
          className="sm:col-span-2"
          hint="Stored encrypted. Only you and the guests you approve ever see it."
        >
          <input id="h-address" name="address" maxLength={300} autoComplete="off" className={fieldCls} />
        </Field>
        <label className="flex items-start gap-2 text-[13.5px] text-foreground sm:col-span-2">
          <input type="checkbox" name="approvalRequired" defaultChecked className="mt-0.5 size-4 accent-current" />
          <span>
            I approve each guest
            <span className="block text-[12px] text-foreground-muted">Keep this on for anything in your home.</span>
          </span>
        </label>
        <div className="sm:col-span-2">
          <PendingButton className={primaryBtn}>Post to the board</PendingButton>
        </div>
      </form>
    </details>
  );
}

function HappeningCard({ happening, viewerZone }: { happening: HappeningView; viewerZone: string }) {
  const full = happening.capacity !== null && happening.going >= happening.capacity;
  const requests = happening.requests.filter((r) => r.status === "requested");
  const guests = happening.requests.filter((r) => r.status === "approved");

  return (
    <article className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone="brand">{HAPPENING_KINDS[happening.kind]}</Pill>
        {happening.isHost ? <Pill>You’re hosting</Pill> : null}
        {happening.viewerRsvp === "approved" ? <Pill>You’re going</Pill> : null}
        {happening.viewerRsvp === "requested" ? <Pill>Asked to join</Pill> : null}
      </div>
      <h3 className="mt-2 text-[16px] font-bold text-foreground">{happening.title}</h3>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-foreground-muted">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="size-3.5" aria-hidden />
          <EventTime
            startsAt={happening.startsAt}
            eventTimeZone={viewerZone}
            viewerTimeZone={viewerZone}
            showZone={false}
          />
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          {happening.place}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" aria-hidden />
          {happening.going} going{happening.capacity !== null ? ` of ${happening.capacity}` : ""}
        </span>
      </p>
      {happening.description ? (
        <p className="mt-2 whitespace-pre-line text-[13.5px] text-foreground">{happening.description}</p>
      ) : null}

      {happening.address ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-ctl bg-surface-muted px-3 py-2 text-[13.5px] text-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="block text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground-muted">Address</span>
            {happening.address}
          </span>
        </p>
      ) : happening.hasAddress ? (
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-foreground-muted">
          <Lock className="size-3.5" aria-hidden />
          The address is shared with guests once the host approves them.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Link href={`/members/${happening.host.handle}`} className="mr-auto flex items-center gap-2 text-[13px] text-foreground no-underline hover:underline">
          <Avatar name={happening.host.displayName} src={happening.host.avatarUrl} size="sm" className="size-7 text-[10px]" />
          Hosted by {happening.host.displayName}
        </Link>

        {happening.isHost ? (
          <form action={cancelHappeningAction}>
            <input type="hidden" name="happeningId" value={happening.id} />
            <PendingButton className={linkBtn}>Call it off</PendingButton>
          </form>
        ) : happening.viewerRsvp === "requested" || happening.viewerRsvp === "approved" ? (
          <form action={withdrawRsvpAction}>
            <input type="hidden" name="happeningId" value={happening.id} />
            <PendingButton className={quietBtn}>
              {happening.viewerRsvp === "approved" ? "I can’t make it" : "Withdraw request"}
            </PendingButton>
          </form>
        ) : happening.viewerRsvp === "declined" ? (
          <span className="text-[12.5px] text-foreground-muted">The host couldn’t fit you in this time.</span>
        ) : full ? (
          <span className="text-[12.5px] font-semibold text-foreground-muted">Full</span>
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
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {requests.length > 0 ? (
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-foreground-muted">
              Waiting for you · {requests.length}
            </p>
          ) : null}
          <ul className="space-y-1.5">
            {[...requests, ...guests].map((request) => (
              <li key={request.rsvpId} className="flex flex-wrap items-center gap-2">
                <Avatar name={request.person.displayName} src={request.person.avatarUrl} size="sm" className="size-7 text-[10px]" />
                <Link href={`/members/${request.person.handle}`} className="mr-auto text-[13.5px] font-semibold text-foreground no-underline hover:underline">
                  {request.person.displayName}
                </Link>
                {request.status === "requested" ? (
                  <>
                    <form action={decideRsvpAction}>
                      <input type="hidden" name="rsvpId" value={request.rsvpId} />
                      <input type="hidden" name="decision" value="approve" />
                      <PendingButton className={cn(primaryBtn, "h-8 px-3")}>
                        <Check className="size-3.5" aria-hidden />
                        Approve
                      </PendingButton>
                    </form>
                    <form action={decideRsvpAction}>
                      <input type="hidden" name="rsvpId" value={request.rsvpId} />
                      <input type="hidden" name="decision" value="decline" />
                      <PendingButton className={cn(quietBtn, "h-8 px-3")}>
                        <X className="size-3.5" aria-hidden />
                        Decline
                      </PendingButton>
                    </form>
                  </>
                ) : (
                  <span className="text-[12px] font-semibold text-foreground-muted">Coming</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
