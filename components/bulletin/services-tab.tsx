import Link from "next/link";
import { ChevronDown, Handshake, MapPin, MessageSquare, Search } from "lucide-react";
import { SERVICE_CATEGORIES, type OwnCard, type ServiceView } from "@/lib/bulletin";
import { bulletinAnchor } from "@/lib/bulletin/card";
import { Avatar } from "@/components/ui/avatar";
import { PendingButton } from "@/components/ui/pending-button";
import { RichText } from "@/components/content/rich-text";
import { BulletinThreadBar, KitchenTableLink, type BulletinViewer } from "@/components/bulletin/thread";
import {
  Button,
  ButtonLink,
  Card,
  Input,
  Select,
  Textarea,
  buttonClass,
  cardClass,
} from "@/components/app/ui";
import { Blank, Field, Pill, primaryBtn, summaryCls } from "@/components/bulletin/ui";
import { deleteCardAction, saveCardAction } from "@/app/(member)/bulletin/actions";

const STATUS_COPY: Record<OwnCard["status"], string> = {
  pending: "Waiting for review. It appears on the board, and in the Kitchen Table, once staff approve it.",
  approved: "Live on the board, and posted in the Kitchen Table.",
  rejected: "Not listed. Edit it and it goes back for review.",
};

const REMOVED_COPY =
  "A moderator took this card’s Kitchen Table post down, so it is not listed. Edit it and it goes back for review.";

function ownPill(own: OwnCard): { label: string; tone: "brand" | "neutral" } {
  if (own.removed) return { label: "Taken down", tone: "neutral" };
  if (own.status === "approved") return { label: "Live", tone: "brand" };
  if (own.status === "pending") return { label: "In review", tone: "neutral" };
  return { label: "Needs changes", tone: "neutral" };
}

/**
 * Member services: one card per member, reviewed before it is listed. The
 * viewer's own card sits at the top whatever its state, so they always know
 * where it stands. A listed card is also a Kitchen Table post, and its
 * reactions and comments show under it here.
 */
export function ServicesTab({
  cards,
  own,
  q,
  category,
  defaultCity,
  viewer,
}: {
  cards: ServiceView[];
  own: OwnCard | null;
  q: string;
  category: string | null;
  defaultCity: string;
  viewer: BulletinViewer;
}) {
  const pill = own ? ownPill(own) : null;
  return (
    <div className="flex flex-col gap-5">
      <details
        className={cardClass({ padding: "none", className: "group" })}
        open={own?.status === "rejected" || own?.removed || undefined}
      >
        <summary className={summaryCls}>
          <span className="inline-flex min-w-0 items-center gap-2.5">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash"
              aria-hidden
            >
              <Handshake className="size-4" />
            </span>
            {own ? "Your service card" : "Offer a service"}
          </span>
          <span className="inline-flex shrink-0 items-center gap-2">
            {pill ? <Pill tone={pill.tone}>{pill.label}</Pill> : null}
            <ChevronDown
              className="size-4 text-foreground-muted transition-transform group-open:rotate-180"
              aria-hidden
            />
          </span>
        </summary>
        <form
          action={saveCardAction}
          className="grid grid-cols-1 gap-4 border-t border-separator p-4 sm:grid-cols-2 sm:p-5"
        >
          {own ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-span-2">
              <p className="text-label text-foreground-muted">
                {own.removed ? REMOVED_COPY : STATUS_COPY[own.status]}
              </p>
              {own.postId && own.status === "approved" && !own.removed ? (
                <KitchenTableLink postId={own.postId} title={own.title} />
              ) : null}
            </div>
          ) : (
            <p className="text-label text-foreground-muted sm:col-span-2">
              Staff check each card first. Once it is approved it is listed here and posted in the
              Kitchen Table.
            </p>
          )}
          <Field label="What you offer" htmlFor="s-title" className="sm:col-span-2">
            <Input id="s-title" name="title" required minLength={3} maxLength={120} defaultValue={own?.title} placeholder="Plant-based meal prep for busy weeks" />
          </Field>
          <Field label="Category" htmlFor="s-category">
            <Select id="s-category" name="category" required defaultValue={own?.category ?? "lessons"}>
              {Object.entries(SERVICE_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="City" htmlFor="s-city" hint="Leave empty if you work online.">
            <Input id="s-city" name="city" maxLength={80} defaultValue={own?.city ?? defaultCity} />
          </Field>
          <Field
            label="Describe it"
            htmlFor="s-body"
            className="sm:col-span-2"
            hint="Keep it accurate and fully vegan. No health or medical claims, and no multi-level marketing."
          >
            <Textarea id="s-body" name="body" required minLength={10} maxLength={2000} rows={4} defaultValue={own?.body} />
          </Field>
          <div className="flex flex-wrap items-center gap-3 border-t border-separator pt-4 sm:col-span-2">
            <PendingButton className={primaryBtn}>{own ? "Save and send for review" : "Send for review"}</PendingButton>
          </div>
        </form>
        {own ? (
          <form action={deleteCardAction} className="border-t border-separator px-4 py-3 sm:px-5">
            <PendingButton className={buttonClass({ variant: "danger", size: "sm" })}>Remove my card</PendingButton>
          </form>
        ) : null}
      </details>

      <form action="/bulletin" method="get" className="flex flex-wrap gap-2" role="search">
        <input type="hidden" name="tab" value="services" />
        <label htmlFor="s-q" className="sr-only">
          Search services
        </label>
        <Input id="s-q" name="q" defaultValue={q} placeholder="Search services or cities" className="w-auto min-w-48 flex-1" />
        <label htmlFor="s-cat" className="sr-only">
          Category
        </label>
        <Select id="s-cat" name="category" defaultValue={category ?? ""} className="w-auto">
          <option value="">All categories</option>
          {Object.entries(SERVICE_CATEGORIES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Button type="submit">
          <Search className="size-4" aria-hidden />
          Search
        </Button>
      </form>

      {cards.length === 0 ? (
        <Blank
          icon={Handshake}
          title={q || category ? "No service matches" : "No services listed yet"}
          body={
            q || category
              ? "Try another word or category."
              : "Members who cook, cater, teach or grow can offer it here. Cards appear once staff have reviewed them."
          }
          action={q || category ? { href: "/bulletin?tab=services", label: "Show all services" } : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {cards.map((card) => (
            <li key={card.id}>
              <ServiceCard card={card} viewer={viewer} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ServiceCard({ card, viewer }: { card: ServiceView; viewer: BulletinViewer }) {
  const anchor = bulletinAnchor("service", card.id);
  return (
    <Card
      as="article"
      id={anchor}
      aria-labelledby={`${anchor}-title`}
      className="scroll-mt-24 target:border-brand target:shadow-e2"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 grow basis-48 items-center gap-2.5">
          <Avatar name={card.person.displayName} src={card.person.avatarUrl} size="sm" />
          <div className="min-w-0">
            <Link
              href={`/members/${card.person.handle}`}
              className="block truncate text-label font-semibold text-foreground no-underline hover:underline"
            >
              {card.person.displayName}
            </Link>
            <p className="flex min-w-0 items-center gap-1 text-caption text-foreground-muted">
              <span className="shrink-0">{card.category ? SERVICE_CATEGORIES[card.category] : "Service"}</span>
              <span aria-hidden>·</span>
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{card.city ?? "Online"}</span>
            </p>
          </div>
        </div>
        {card.thread ? <KitchenTableLink postId={card.thread.postId} title={card.title} /> : null}
      </div>
      <h3 id={`${anchor}-title`} className="mt-3 text-title font-semibold text-foreground text-pretty">
        {card.title}
      </h3>
      <RichText body={card.body} className="mt-1 text-body text-foreground-muted" />
      <ButtonLink
        href={`/messages/new?to=${encodeURIComponent(card.person.handle)}`}
        size="sm"
        className="mt-4"
      >
        <MessageSquare className="size-4" aria-hidden />
        Message
      </ButtonLink>

      <BulletinThreadBar thread={card.thread} viewer={viewer} />
    </Card>
  );
}
