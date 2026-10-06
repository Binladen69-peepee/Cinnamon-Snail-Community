import Link from "next/link";
import { ClipboardCheck, ExternalLink, Handshake, MessagesSquare, Store } from "lucide-react";
import { loadReviewQueue, PLACE_CATEGORIES, SERVICE_CATEGORIES, VEGAN_STATUS } from "@/lib/bulletin";
import { countMissingBulletinPosts } from "@/lib/bulletin/posts";
import { Avatar } from "@/components/ui/avatar";
import { RichText } from "@/components/content/rich-text";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  buttonClass,
} from "@/components/app/ui";
import { PendingButton } from "@/components/ui/pending-button";
import { backfillPostsAction, reviewCardAction, reviewPlaceAction } from "./actions";

export const metadata = { title: "Bulletin review" };

const label = <T extends object>(map: T, key: string | null) =>
  key && key in map ? (map[key as keyof T] as string) : key ?? "—";

/**
 * What members have asked to put on the Bulletin Board.
 *
 * Service cards and places wait here until someone checks them against the
 * rules BUILD.md §19 sets: accurate, vegan, no medical claims, no MLM, no
 * animal products. Gatherings are not reviewed; their hosts approve guests,
 * and a gathering reported in the Kitchen Table is handled in moderation.
 * Approving an item writes its Kitchen Table post (DEC-078).
 */
export default async function AdminBulletinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; posted?: string }>;
}) {
  const params = await searchParams;
  const [queue, missing] = await Promise.all([loadReviewQueue(), countMissingBulletinPosts()]);
  const waiting = queue.cards.length + queue.places.length;
  const posted = params.posted !== undefined ? Number.parseInt(params.posted, 10) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bulletin review"
        description={waiting > 0 ? `${waiting} waiting for a decision.` : "Nothing is waiting."}
      >
        <p className="max-w-[64ch] text-label text-foreground-muted text-pretty">
          Approve only what is accurate and fully vegan, with no health or medical claims and no
          multi-level marketing. The member is told either way, and an approved item is posted in
          the Kitchen Table under their name.
        </p>
      </PageHeader>

      {params.error === "backfill" ? (
        <Callout tone="danger">The Kitchen Table posts were not written. Try again.</Callout>
      ) : params.error ? (
        <Callout tone="danger">That decision did not save. Try again.</Callout>
      ) : null}
      {posted !== null && Number.isFinite(posted) && posted >= 0 ? (
        <Callout tone="success">
          {posted === 0
            ? "Nothing was missing: every live item already has its Kitchen Table post."
            : `${posted} ${posted === 1 ? "item is" : "items are"} now in the Kitchen Table.`}
        </Callout>
      ) : null}

      <Card padding="none" aria-labelledby="cards-title">
        <CardHeader
          title={<span id="cards-title">Service cards</span>}
          icon={<Handshake />}
          count={queue.cards.length}
        />
        {queue.cards.length === 0 ? (
          <EmptyState
            size="sm"
            bordered={false}
            icon={<ClipboardCheck />}
            title="No cards to review"
            description="New and edited service cards appear here."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {queue.cards.map((card) => (
              <li key={card.id} className="flex flex-col gap-2.5 px-4 py-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={card.person.displayName} src={card.person.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/members?q=${encodeURIComponent(card.person.handle)}`}
                      className="block truncate text-label font-semibold text-foreground no-underline hover:underline"
                    >
                      {card.person.displayName}
                    </Link>
                    <p className="truncate text-caption text-foreground-muted">
                      @{card.person.handle} · {label(SERVICE_CATEGORIES, card.category)}
                      {card.city ? ` · ${card.city}` : ""}
                    </p>
                  </div>
                  {card.hasPost ? <Badge tone="info">Edit of a live card</Badge> : null}
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-reading font-semibold text-foreground">{card.title}</p>
                  <RichText body={card.body} className="text-body leading-relaxed text-foreground" />
                </div>
                <Decision action={reviewCardAction} id={card.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="none" aria-labelledby="places-title">
        <CardHeader
          title={<span id="places-title">Places</span>}
          icon={<Store />}
          count={queue.places.length}
        />
        {queue.places.length === 0 ? (
          <EmptyState
            size="sm"
            bordered={false}
            icon={<ClipboardCheck />}
            title="No places to review"
            description="Places members submit appear here."
          />
        ) : (
          <ul className="divide-y divide-separator">
            {queue.places.map((place) => (
              <li key={place.id} className="flex flex-col gap-2 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-reading font-semibold text-foreground">{place.name}</p>
                  <Badge tone={place.veganStatus === "fully-vegan" ? "success" : "neutral"}>
                    {label(VEGAN_STATUS, place.veganStatus)}
                  </Badge>
                </div>
                <p className="text-body text-foreground-muted">
                  {label(PLACE_CATEGORIES, place.category)} · {place.place}
                  {place.address ? ` · ${place.address}` : ""}
                </p>
                {place.website ? (
                  <a
                    href={place.website}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex w-fit max-w-full items-center gap-1 text-label font-medium text-link no-underline hover:underline"
                  >
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{place.website}</span>
                  </a>
                ) : null}
                <p className="text-caption text-foreground-muted">
                  Submitted by {place.submittedBy ? `@${place.submittedBy.handle}` : "a former member"}
                  {place.submittedBy ? null : ". With nobody to post as, it will not get a Kitchen Table post."}
                </p>
                <Decision action={reviewPlaceAction} id={place.id} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="none" aria-labelledby="posts-title">
        <CardHeader
          title={<span id="posts-title">Kitchen Table posts</span>}
          icon={<MessagesSquare />}
          description="Every live item is also a post in the Kitchen Table, so its comments are shared."
        />
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0 text-body text-foreground">
            {missing.total === 0 ? (
              <p>Every live item has its post.</p>
            ) : (
              <p>
                {missing.total} live {missing.total === 1 ? "item is" : "items are"} not in the
                Kitchen Table yet ({missing.happenings} gatherings, {missing.services} services,{" "}
                {missing.places} places). The daily job adds them, or add them now.
              </p>
            )}
            {missing.unattributed > 0 ? (
              <p className="mt-1 text-caption text-foreground-muted">
                {missing.unattributed} approved{" "}
                {missing.unattributed === 1 ? "place has" : "places have"} no post because the
                member who added {missing.unattributed === 1 ? "it" : "them"} has left. They stay
                on the board.
              </p>
            ) : null}
          </div>
          {missing.total > 0 ? (
            <form action={backfillPostsAction} className="shrink-0">
              <PendingButton className={buttonClass({ variant: "primary", size: "sm" })}>
                Add them now
              </PendingButton>
            </form>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function Decision({ action, id }: { action: (formData: FormData) => Promise<void>; id: string }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="approve" />
        <PendingButton className={buttonClass({ variant: "primary", size: "sm" })}>
          Approve
        </PendingButton>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="reject" />
        <PendingButton className={buttonClass({ variant: "danger", size: "sm" })}>
          Reject
        </PendingButton>
      </form>
    </div>
  );
}
