import Link from "next/link";
import { ChevronDown, Handshake, MapPin, MessageSquare, Search } from "lucide-react";
import { SERVICE_CATEGORIES, type OwnCard, type ServiceView } from "@/lib/bulletin";
import { Avatar } from "@/components/ui/avatar";
import { PendingButton } from "@/components/ui/pending-button";
import {
  Button,
  ButtonLink,
  Input,
  Select,
  Textarea,
  buttonClass,
  cardClass,
} from "@/components/app/ui";
import { Blank, Field, Pill, primaryBtn, summaryCls } from "@/components/bulletin/ui";
import { deleteCardAction, saveCardAction } from "@/app/(member)/bulletin/actions";

const STATUS_COPY: Record<OwnCard["status"], string> = {
  pending: "Waiting for review. It appears on the board once staff approve it.",
  approved: "Live on the board.",
  rejected: "Not listed. Edit it and it goes back for review.",
};

/**
 * Member services: one card per member, reviewed before it is listed. The
 * viewer's own card sits at the top whatever its state, so they always know
 * where it stands.
 */
export function ServicesTab({
  cards,
  own,
  q,
  category,
  defaultCity,
}: {
  cards: ServiceView[];
  own: OwnCard | null;
  q: string;
  category: string | null;
  defaultCity: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <details
        className={cardClass({ padding: "none", className: "group" })}
        open={own?.status === "rejected" || undefined}
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
            {own ? <Pill tone={own.status === "approved" ? "brand" : "neutral"}>{own.status === "pending" ? "In review" : own.status === "approved" ? "Live" : "Needs changes"}</Pill> : null}
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
          {own ? <p className="text-label text-foreground-muted sm:col-span-2">{STATUS_COPY[own.status]}</p> : null}
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
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.id} className={cardClass({ className: "flex flex-col" })}>
              <div className="flex items-center gap-2.5">
                <Avatar name={card.person.displayName} src={card.person.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <Link href={`/members/${card.person.handle}`} className="block truncate text-label font-semibold text-foreground no-underline hover:underline">
                    {card.person.displayName}
                  </Link>
                  <p className="flex min-w-0 items-center gap-1 text-caption text-foreground-muted">
                    {card.category ? SERVICE_CATEGORIES[card.category] : "Service"}
                    {card.city ? (
                      <>
                        {" · "}
                        <MapPin className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{card.city}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
              <h3 className="mt-3 text-title font-semibold text-foreground text-pretty">{card.title}</h3>
              <p className="mt-1 line-clamp-5 flex-1 whitespace-pre-line text-body text-foreground-muted">{card.body}</p>
              <ButtonLink
                href={`/messages/new?to=${encodeURIComponent(card.person.handle)}`}
                size="sm"
                className="mt-4 self-start"
              >
                <MessageSquare className="size-4" aria-hidden />
                Message
              </ButtonLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
