import Link from "next/link";
import { ChevronDown, ExternalLink, MapPin, MessageCircle, Plus, Search, Store } from "lucide-react";
import { PLACE_CATEGORIES, VEGAN_STATUS, type PlaceView } from "@/lib/bulletin";
import { PendingButton } from "@/components/ui/pending-button";
import {
  Button,
  Card,
  Input,
  Select,
  Textarea,
  buttonClass,
  cardClass,
} from "@/components/app/ui";
import { Blank, Field, linkBtn, Pill, primaryBtn, summaryCls } from "@/components/bulletin/ui";
import { submitPlaceAction, testimonialAction } from "@/app/(member)/bulletin/actions";

/**
 * The member map of vegan places.
 *
 * A list grouped by city rather than a drawn map: BUILD.md §19 names a places
 * provider "if approved", and none is. Every entry is member-submitted and
 * staff-reviewed, so nothing here is scraped or invented.
 */
export function PlacesTab({
  places,
  pending,
  q,
  category,
  defaults,
}: {
  places: PlaceView[];
  pending: { id: string; name: string; city: string; status: string }[];
  q: string;
  category: string | null;
  defaults: { city: string; region: string; country: string };
}) {
  const byCity = new Map<string, PlaceView[]>();
  for (const place of places) {
    const list = byCity.get(place.place) ?? [];
    list.push(place);
    byCity.set(place.place, list);
  }

  return (
    <div className="flex flex-col gap-5">
      <details className={cardClass({ padding: "none", className: "group" })}>
        <summary className={summaryCls}>
          <span className="inline-flex items-center gap-2.5">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash"
              aria-hidden
            >
              <Plus className="size-4" />
            </span>
            Add a vegan place
          </span>
          <span className="inline-flex items-center gap-1 text-caption font-normal text-foreground-muted">
            <span className="group-open:hidden">Open</span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <form
          action={submitPlaceAction}
          className="grid grid-cols-1 gap-4 border-t border-separator p-4 sm:grid-cols-2 sm:p-5"
        >
          <p className="text-label text-foreground-muted sm:col-span-2">
            Businesses only, never someone’s home. Staff check each one before it is listed.
          </p>
          <Field label="Name" htmlFor="p-name" className="sm:col-span-2">
            <Input id="p-name" name="name" required minLength={2} maxLength={120} />
          </Field>
          <Field label="Kind of place" htmlFor="p-category">
            <Select id="p-category" name="category" required defaultValue="restaurant">
              {Object.entries(PLACE_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How vegan" htmlFor="p-status">
            <Select id="p-status" name="veganStatus" required defaultValue="fully-vegan">
              {Object.entries(VEGAN_STATUS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="City" htmlFor="p-city">
            <Input id="p-city" name="city" required maxLength={80} defaultValue={defaults.city} />
          </Field>
          <Field label="Region" htmlFor="p-region">
            <Input id="p-region" name="region" maxLength={80} defaultValue={defaults.region} />
          </Field>
          <Field label="Country" htmlFor="p-country">
            <Input id="p-country" name="country" maxLength={80} defaultValue={defaults.country} />
          </Field>
          <Field label="Website" htmlFor="p-web">
            <Input id="p-web" name="website" type="url" maxLength={300} placeholder="https://" />
          </Field>
          <Field label="Street address" htmlFor="p-address" className="sm:col-span-2">
            <Input id="p-address" name="address" maxLength={300} />
          </Field>
          <div className="border-t border-separator pt-4 sm:col-span-2">
            <PendingButton className={primaryBtn}>Send for review</PendingButton>
          </div>
        </form>
      </details>

      {pending.length > 0 ? (
        <ul className={cardClass({ padding: "none", className: "divide-y divide-separator" })}>
          {pending.map((place) => (
            <li key={place.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-label sm:px-5">
              <span className="font-semibold text-foreground">{place.name}</span>
              <span className="mr-auto text-foreground-muted">{place.city}</span>
              <Pill>{place.status === "pending" ? "In review" : "Not added"}</Pill>
            </li>
          ))}
        </ul>
      ) : null}

      <form action="/bulletin" method="get" className="flex flex-wrap gap-2" role="search">
        <input type="hidden" name="tab" value="places" />
        <label htmlFor="p-q" className="sr-only">
          Search places
        </label>
        <Input id="p-q" name="q" defaultValue={q} placeholder="Search by name, city or country" className="w-auto min-w-48 flex-1" />
        <label htmlFor="p-cat" className="sr-only">
          Kind of place
        </label>
        <Select id="p-cat" name="category" defaultValue={category ?? ""} className="w-auto">
          <option value="">Every kind</option>
          {Object.entries(PLACE_CATEGORIES).map(([value, label]) => (
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

      {places.length === 0 ? (
        <Blank
          icon={Store}
          title={q || category ? "No place matches" : "No places on the map yet"}
          body={
            q || category
              ? "Try a nearby city, or add the place yourself."
              : "Know a good vegan spot? Add it, and once it is checked every member can find it."
          }
          action={q || category ? { href: "/bulletin?tab=places", label: "Show every place" } : undefined}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {[...byCity.entries()].map(([city, list]) => (
            <section key={city} aria-label={city} className="flex flex-col gap-2.5">
              <h2 className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.08em] text-foreground-muted">
                <MapPin className="size-3.5" aria-hidden />
                {city}
              </h2>
              <ul className="flex flex-col gap-3">
                {list.map((place) => (
                  <li key={place.id}>
                    <PlaceCard place={place} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaceCard({ place }: { place: PlaceView }) {
  return (
    <Card as="article">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-title font-semibold text-foreground text-pretty">{place.name}</h3>
          <p className="mt-0.5 text-label text-foreground-muted">
            {PLACE_CATEGORIES[place.category]}
            {place.address ? ` · ${place.address}` : ""}
          </p>
        </div>
        <Pill tone={place.veganStatus === "fully-vegan" ? "brand" : "neutral"}>{VEGAN_STATUS[place.veganStatus]}</Pill>
      </div>
      {place.website ? (
        <a href={place.website} target="_blank" rel="noopener noreferrer nofollow" className={`${linkBtn} mt-2.5`}>
          <ExternalLink aria-hidden />
          Website
        </a>
      ) : null}

      {place.testimonials.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3 border-t border-separator pt-3">
          {place.testimonials.map((t) => (
            <li key={t.id} className="text-body">
              <p className="text-foreground">“{t.body}”</p>
              <Link
                href={`/members/${t.person.handle}`}
                className="mt-0.5 inline-block text-caption font-medium text-foreground-muted no-underline transition hover:text-foreground hover:underline"
              >
                {t.person.displayName}
              </Link>
            </li>
          ))}
          {place.testimonialCount > place.testimonials.length ? (
            <li className="text-caption text-foreground-muted">
              and {place.testimonialCount - place.testimonials.length} more
            </li>
          ) : null}
        </ul>
      ) : null}

      <details className="mt-3">
        <summary className={`${linkBtn} list-none [&::-webkit-details-marker]:hidden`}>
          <MessageCircle aria-hidden />
          {place.viewerWrote ? "Update what you said" : "Say what you had there"}
        </summary>
        <form action={testimonialAction} className="mt-2.5 flex flex-col gap-2">
          <input type="hidden" name="placeId" value={place.id} />
          <label htmlFor={`t-${place.id}`} className="sr-only">
            Your testimonial for {place.name}
          </label>
          <Textarea id={`t-${place.id}`} name="body" required minLength={10} maxLength={1000} rows={2} className="min-h-20" />
          <PendingButton className={buttonClass({ size: "sm", className: "self-start" })}>Share</PendingButton>
        </form>
      </details>
    </Card>
  );
}
