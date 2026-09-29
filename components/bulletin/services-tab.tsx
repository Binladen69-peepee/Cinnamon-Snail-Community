import Link from "next/link";
import { Handshake, MapPin, MessageSquare, Search } from "lucide-react";
import { SERVICE_CATEGORIES, type OwnCard, type ServiceView } from "@/lib/bulletin";
import { Avatar } from "@/components/ui/avatar";
import { PendingButton } from "@/components/ui/pending-button";
import { Blank, Field, fieldCls, linkBtn, Pill, primaryBtn, quietBtn, summaryCls } from "@/components/bulletin/ui";
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
    <div className="space-y-4">
      <details className="group" open={own?.status === "rejected" || undefined}>
        <summary className={summaryCls}>
          <span className="inline-flex items-center gap-2">
            <Handshake className="size-4" aria-hidden />
            {own ? "Your service card" : "Offer a service"}
          </span>
          {own ? <Pill tone={own.status === "approved" ? "brand" : "neutral"}>{own.status === "pending" ? "In review" : own.status === "approved" ? "Live" : "Needs changes"}</Pill> : null}
        </summary>
        <form action={saveCardAction} className="mt-2 grid grid-cols-1 gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2">
          {own ? <p className="text-[13px] text-foreground-muted sm:col-span-2">{STATUS_COPY[own.status]}</p> : null}
          <Field label="What you offer" htmlFor="s-title" className="sm:col-span-2">
            <input id="s-title" name="title" required minLength={3} maxLength={120} defaultValue={own?.title} placeholder="Plant-based meal prep for busy weeks" className={fieldCls} />
          </Field>
          <Field label="Category" htmlFor="s-category">
            <select id="s-category" name="category" required defaultValue={own?.category ?? "lessons"} className={fieldCls}>
              {Object.entries(SERVICE_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="City" htmlFor="s-city" hint="Leave empty if you work online.">
            <input id="s-city" name="city" maxLength={80} defaultValue={own?.city ?? defaultCity} className={fieldCls} />
          </Field>
          <Field
            label="Describe it"
            htmlFor="s-body"
            className="sm:col-span-2"
            hint="Keep it accurate and fully vegan. No health or medical claims, and no multi-level marketing."
          >
            <textarea id="s-body" name="body" required minLength={10} maxLength={2000} rows={4} defaultValue={own?.body} className={fieldCls} />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <PendingButton className={primaryBtn}>{own ? "Save and send for review" : "Send for review"}</PendingButton>
          </div>
        </form>
        {own ? (
          <form action={deleteCardAction} className="mt-2 px-1">
            <PendingButton className={linkBtn}>Remove my card</PendingButton>
          </form>
        ) : null}
      </details>

      <form action="/bulletin" method="get" className="flex flex-wrap gap-2" role="search">
        <input type="hidden" name="tab" value="services" />
        <label htmlFor="s-q" className="sr-only">
          Search services
        </label>
        <input id="s-q" name="q" defaultValue={q} placeholder="Search services or cities" className={`${fieldCls} min-w-0 flex-1`} />
        <label htmlFor="s-cat" className="sr-only">
          Category
        </label>
        <select id="s-cat" name="category" defaultValue={category ?? ""} className={`${fieldCls} w-auto`}>
          <option value="">All categories</option>
          {Object.entries(SERVICE_CATEGORIES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className={quietBtn}>
          <Search className="size-4" aria-hidden />
          Search
        </button>
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
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {cards.map((card) => (
            <li key={card.id} className="flex flex-col rounded-card border border-border bg-surface p-4">
              <div className="flex items-center gap-2.5">
                <Avatar name={card.person.displayName} src={card.person.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <Link href={`/members/${card.person.handle}`} className="block truncate text-[13.5px] font-semibold text-foreground no-underline hover:underline">
                    {card.person.displayName}
                  </Link>
                  <p className="flex items-center gap-1 text-[12px] text-foreground-muted">
                    {card.category ? SERVICE_CATEGORIES[card.category] : "Service"}
                    {card.city ? (
                      <>
                        {" · "}
                        <MapPin className="size-3" aria-hidden />
                        {card.city}
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
              <h3 className="mt-3 text-[15px] font-bold text-foreground">{card.title}</h3>
              <p className="mt-1 line-clamp-5 flex-1 whitespace-pre-line text-[13.5px] text-foreground-muted">{card.body}</p>
              <Link href={`/messages/new?to=${encodeURIComponent(card.person.handle)}`} className={`${quietBtn} mt-3 self-start`}>
                <MessageSquare className="size-4" aria-hidden />
                Message
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
