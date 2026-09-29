import Link from "next/link";
import { ExternalLink, MapPin, MessageCircle, Plus, Search, Store } from "lucide-react";
import { PLACE_CATEGORIES, VEGAN_STATUS, type PlaceView } from "@/lib/bulletin";
import { PendingButton } from "@/components/ui/pending-button";
import { Blank, Field, fieldCls, linkBtn, Pill, primaryBtn, quietBtn, summaryCls } from "@/components/bulletin/ui";
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
    <div className="space-y-4">
      <details className="group">
        <summary className={summaryCls}>
          <span className="inline-flex items-center gap-2">
            <Plus className="size-4" aria-hidden />
            Add a vegan place
          </span>
          <span className="text-[12px] font-normal text-foreground-muted group-open:hidden">Open</span>
        </summary>
        <form action={submitPlaceAction} className="mt-2 grid grid-cols-1 gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2">
          <p className="text-[13px] text-foreground-muted sm:col-span-2">
            Businesses only, never someone’s home. Staff check each one before it is listed.
          </p>
          <Field label="Name" htmlFor="p-name" className="sm:col-span-2">
            <input id="p-name" name="name" required minLength={2} maxLength={120} className={fieldCls} />
          </Field>
          <Field label="Kind of place" htmlFor="p-category">
            <select id="p-category" name="category" required defaultValue="restaurant" className={fieldCls}>
              {Object.entries(PLACE_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How vegan" htmlFor="p-status">
            <select id="p-status" name="veganStatus" required defaultValue="fully-vegan" className={fieldCls}>
              {Object.entries(VEGAN_STATUS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="City" htmlFor="p-city">
            <input id="p-city" name="city" required maxLength={80} defaultValue={defaults.city} className={fieldCls} />
          </Field>
          <Field label="Region" htmlFor="p-region">
            <input id="p-region" name="region" maxLength={80} defaultValue={defaults.region} className={fieldCls} />
          </Field>
          <Field label="Country" htmlFor="p-country">
            <input id="p-country" name="country" maxLength={80} defaultValue={defaults.country} className={fieldCls} />
          </Field>
          <Field label="Website" htmlFor="p-web">
            <input id="p-web" name="website" type="url" maxLength={300} placeholder="https://" className={fieldCls} />
          </Field>
          <Field label="Street address" htmlFor="p-address" className="sm:col-span-2">
            <input id="p-address" name="address" maxLength={300} className={fieldCls} />
          </Field>
          <div className="sm:col-span-2">
            <PendingButton className={primaryBtn}>Send for review</PendingButton>
          </div>
        </form>
      </details>

      {pending.length > 0 ? (
        <ul className="space-y-1 rounded-card border border-border bg-surface px-4 py-3 text-[13px]">
          {pending.map((place) => (
            <li key={place.id} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">{place.name}</span>
              <span className="text-foreground-muted">{place.city}</span>
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
        <input id="p-q" name="q" defaultValue={q} placeholder="Search by name, city or country" className={`${fieldCls} min-w-0 flex-1`} />
        <label htmlFor="p-cat" className="sr-only">
          Kind of place
        </label>
        <select id="p-cat" name="category" defaultValue={category ?? ""} className={`${fieldCls} w-auto`}>
          <option value="">Every kind</option>
          {Object.entries(PLACE_CATEGORIES).map(([value, label]) => (
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
        <div className="space-y-5">
          {[...byCity.entries()].map(([city, list]) => (
            <section key={city} aria-label={city} className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-foreground-muted">
                <MapPin className="size-3" aria-hidden />
                {city}
              </h3>
              <ul className="space-y-2">
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
    <article className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[15px] font-bold text-foreground">{place.name}</h4>
          <p className="text-[12.5px] text-foreground-muted">
            {PLACE_CATEGORIES[place.category]}
            {place.address ? ` · ${place.address}` : ""}
          </p>
        </div>
        <Pill tone={place.veganStatus === "fully-vegan" ? "brand" : "neutral"}>{VEGAN_STATUS[place.veganStatus]}</Pill>
      </div>
      {place.website ? (
        <a href={place.website} target="_blank" rel="noopener noreferrer nofollow" className={`${linkBtn} mt-2`}>
          <ExternalLink className="size-3.5" aria-hidden />
          Website
        </a>
      ) : null}

      {place.testimonials.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {place.testimonials.map((t) => (
            <li key={t.id} className="text-[13.5px]">
              <p className="text-foreground">“{t.body}”</p>
              <Link href={`/members/${t.person.handle}`} className="text-[12px] font-semibold text-foreground-muted no-underline hover:underline">
                {t.person.displayName}
              </Link>
            </li>
          ))}
          {place.testimonialCount > place.testimonials.length ? (
            <li className="text-[12px] text-foreground-muted">
              and {place.testimonialCount - place.testimonials.length} more
            </li>
          ) : null}
        </ul>
      ) : null}

      <details className="mt-3">
        <summary className={`${linkBtn} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <MessageCircle className="size-3.5" aria-hidden />
          {place.viewerWrote ? "Update what you said" : "Say what you had there"}
        </summary>
        <form action={testimonialAction} className="mt-2 space-y-2">
          <input type="hidden" name="placeId" value={place.id} />
          <label htmlFor={`t-${place.id}`} className="sr-only">
            Your testimonial for {place.name}
          </label>
          <textarea id={`t-${place.id}`} name="body" required minLength={10} maxLength={1000} rows={2} className={fieldCls} />
          <PendingButton className={quietBtn}>Share</PendingButton>
        </form>
      </details>
    </article>
  );
}
