import Link from "next/link";
import { ClipboardCheck, ExternalLink, Handshake, Store } from "lucide-react";
import { loadReviewQueue, PLACE_CATEGORIES, SERVICE_CATEGORIES, VEGAN_STATUS } from "@/lib/bulletin";
import { Avatar } from "@/components/ui/avatar";
import { Badge, EmptyPanel, PageHeader, Panel } from "@/components/admin/ui";
import { PendingButton } from "@/components/ui/pending-button";
import { reviewCardAction, reviewPlaceAction } from "./actions";

export const metadata = { title: "Bulletin review" };

const label = <T extends object>(map: T, key: string | null) =>
  key && key in map ? (map[key as keyof T] as string) : key ?? "—";

/**
 * What members have asked to put on the bulletin board.
 *
 * Service cards and places wait here until someone checks them against the
 * rules BUILD.md §19 sets: accurate, vegan, no medical claims, no MLM, no
 * animal products. Gatherings are not reviewed; their hosts approve guests.
 */
export default async function AdminBulletinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const queue = await loadReviewQueue();
  const waiting = queue.cards.length + queue.places.length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bulletin review"
        subtitle={waiting > 0 ? `${waiting} waiting for a decision.` : "Nothing is waiting."}
      />

      {params.error ? (
        <p role="alert" className="rounded-ctl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[13px] font-semibold text-danger">
          That decision did not save. Try again.
        </p>
      ) : null}

      <p className="text-[13px] text-foreground-muted">
        Approve only what is accurate and fully vegan, with no health or medical claims and no
        multi-level marketing. The member is told either way.
      </p>

      <Panel aria-labelledby="cards-title">
        <h2 id="cards-title" className="flex items-center gap-2 border-b border-border px-4 py-3 text-[14px] font-bold text-foreground">
          <Handshake className="size-4" aria-hidden />
          Service cards
          <Badge>{queue.cards.length}</Badge>
        </h2>
        {queue.cards.length === 0 ? (
          <EmptyPanel icon={<ClipboardCheck className="size-6" aria-hidden />} title="No cards to review" body="New and edited service cards appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {queue.cards.map((card) => (
              <li key={card.id} className="space-y-2 px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar name={card.person.displayName} src={card.person.avatarUrl} size="sm" />
                  <Link href={`/admin/members?q=${encodeURIComponent(card.person.handle)}`} className="text-[13.5px] font-semibold text-foreground no-underline hover:underline">
                    {card.person.displayName}
                  </Link>
                  <span className="text-[12.5px] text-foreground-muted">
                    @{card.person.handle} · {label(SERVICE_CATEGORIES, card.category)}
                    {card.city ? ` · ${card.city}` : ""}
                  </span>
                </div>
                <p className="text-[14.5px] font-bold text-foreground">{card.title}</p>
                <p className="whitespace-pre-line text-[13.5px] text-foreground">{card.body}</p>
                <Decision action={reviewCardAction} id={card.id} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel aria-labelledby="places-title">
        <h2 id="places-title" className="flex items-center gap-2 border-b border-border px-4 py-3 text-[14px] font-bold text-foreground">
          <Store className="size-4" aria-hidden />
          Places
          <Badge>{queue.places.length}</Badge>
        </h2>
        {queue.places.length === 0 ? (
          <EmptyPanel icon={<ClipboardCheck className="size-6" aria-hidden />} title="No places to review" body="Places members submit appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {queue.places.map((place) => (
              <li key={place.id} className="space-y-1.5 px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14.5px] font-bold text-foreground">{place.name}</p>
                  <Badge tone={place.veganStatus === "fully-vegan" ? "good" : "neutral"}>
                    {label(VEGAN_STATUS, place.veganStatus)}
                  </Badge>
                </div>
                <p className="text-[13px] text-foreground-muted">
                  {label(PLACE_CATEGORIES, place.category)} · {place.place}
                  {place.address ? ` · ${place.address}` : ""}
                </p>
                {place.website ? (
                  <a href={place.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-foreground underline-offset-2 hover:underline">
                    <ExternalLink className="size-3.5" aria-hidden />
                    {place.website}
                  </a>
                ) : null}
                <p className="text-[12px] text-foreground-muted">
                  Submitted by {place.submittedBy ? `@${place.submittedBy.handle}` : "a former member"}
                </p>
                <Decision action={reviewPlaceAction} id={place.id} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Decision({ action, id }: { action: (formData: FormData) => Promise<void>; id: string }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="approve" />
        <PendingButton className="vu-btn vu-btn-primary inline-flex h-9 items-center justify-center gap-1.5 px-3.5 text-[13px]">
          Approve
        </PendingButton>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="reject" />
        <PendingButton className="vu-btn vu-btn-secondary inline-flex h-9 items-center justify-center gap-1.5 px-3.5 text-[13px] text-danger hover:text-danger">
          Reject
        </PendingButton>
      </form>
    </div>
  );
}
