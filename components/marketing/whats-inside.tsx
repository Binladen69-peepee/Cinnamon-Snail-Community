import { BookOpen, CalendarDays, FlaskConical, ListChecks, Users } from "lucide-react";
import { MediaFrame } from "@/components/ui/media-frame";
import { Spotlight } from "@/components/marketing/spotlight";
import { CountUp, Rise, Stagger, StaggerItem } from "@/components/marketing/motion";
import { CLASS_LIBRARY } from "@/lib/marketing/class-library";
import { MEMBERSHIP_PAGE } from "@/lib/marketing/copy";
import { servableImageUrl } from "@/lib/media/servable-image";
import { cn } from "@/lib/utils";

/**
 * "What's inside" (DEC-089): the five things a membership is, each with its
 * signed-off description, as one bento grid. This replaces a row of five
 * chips that named the parts and never said what any of them was.
 *
 * Every figure and photo is real: the class count is the class sheet's, the
 * testers are the signed-off "1000+", the stills are Adam's classes, and the
 * occasions are the ones the menus copy names.
 */

const [LIVE, LIBRARY, TABLE, TESTED, MENUS] = MEMBERSHIP_PAGE.inside;

const photoOf = (title: string) =>
  CLASS_LIBRARY.find((cls) => cls.title === title)?.thumbnailUrl ?? null;

/** A still of a class spread, for the live tile. */
const LIVE_PHOTO = photoOf("The best plant-based tacos") ?? CLASS_LIBRARY[0]?.thumbnailUrl ?? "";

/** The occasions the menus copy itself names, each shown by its own class. */
const OCCASIONS = [
  { label: "Thanksgiving", photo: photoOf("Vegan Thanksgiving Training Camp") },
  { label: "Passover", photo: photoOf("Vegan Passover Prep-Along") },
  { label: "Valentine's Day", photo: photoOf("Vegan Valentine's Treats") },
] as const;

/** Lines lifted word for word from the Kitchen Table copy. */
const TABLE_LINES = ["Post your plate.", "Ask the question you think is dumb."] as const;

const tile =
  "vu-bento-tile relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-border bg-surface p-5 sm:p-6";

export function WhatsInside() {
  const strip = CLASS_LIBRARY.slice(0, 12);

  return (
    <section aria-labelledby="whats-inside-heading" className="relative">
      <Rise className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <p className="vu-kicker">What&rsquo;s inside</p>
          <h2 id="whats-inside-heading" className="vu-title-script-sm vu-headline mt-3 text-foreground">
            <span className="vu-title-anim">Everything you get as a member.</span>
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-foreground-muted">
          Five parts, one membership. Monthly or yearly, and you can cancel from your account
          whenever you want.
        </p>
      </Rise>

      <Stagger className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6 lg:grid-rows-[auto_auto_auto] md:mt-11">
        {/* Live cook-alongs: the headline act, on a photograph. */}
        <StaggerItem className="md:col-span-2 lg:col-span-3 lg:row-span-2">
          <Spotlight className={cn(tile, "min-h-104 border-transparent bg-black p-0 text-white sm:p-0")}>
            <div className="absolute inset-0">
              <MediaFrame
                src={LIVE_PHOTO}
                alt=""
                aspect="size-full"
                rounded="rounded-none"
                reveal={false}
              />
            </div>
            <div
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.88)_8%,rgba(0,0,0,0.45)_52%,rgba(0,0,0,0.05)_100%)]"
            />
            <div className="relative mt-auto p-6 sm:p-8">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md">
                <span className="vu-live-dot" aria-hidden />
                Live
              </span>
              <h3 className="mt-4 flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem]">
                <CalendarDays className="size-6 shrink-0" aria-hidden />
                {LIVE?.title}
              </h3>
              <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-white/85">{LIVE?.body}</p>
            </div>
          </Spotlight>
        </StaggerItem>

        {/* The library: the count, and the classes themselves drifting past. */}
        <StaggerItem className="lg:col-span-3">
          <Spotlight className={tile}>
            <div className="flex items-start justify-between gap-4">
              <TileTitle icon={<BookOpen />} title={LIBRARY?.title} />
              <p className="shrink-0 text-right leading-none">
                <CountUp value={CLASS_LIBRARY.length} className="vu-figure text-3xl text-foreground" />
                <span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-foreground-muted">
                  classes
                </span>
              </p>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground-muted">{LIBRARY?.body}</p>
            <div className="vu-strip-mask -mx-5 mt-5 overflow-hidden sm:-mx-6" aria-hidden>
              <ul className="vu-strip flex w-max gap-2.5 px-5 sm:px-6">
                {[...strip, ...strip].map((cls, index) => (
                  <li key={`${cls.slug}-${index}`} className="h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-surface-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={servableImageUrl(cls.thumbnailUrl, 400)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover"
                    />
                  </li>
                ))}
              </ul>
            </div>
          </Spotlight>
        </StaggerItem>

        {/* Kitchen Table: what being in it is like, in its own words. */}
        <StaggerItem className="lg:col-span-3">
          <Spotlight className={tile}>
            <TileTitle icon={<Users />} title={TABLE?.title} />
            <p className="mt-3 text-sm leading-relaxed text-foreground-muted">{TABLE?.body}</p>
            <Stagger className="mt-auto flex flex-col gap-2 pt-5">
              {TABLE_LINES.map((line, index) => (
                <StaggerItem
                  key={line}
                  className={cn(
                    "w-fit max-w-full rounded-2xl px-3.5 py-2 text-[13px] font-medium",
                    index === 0
                      ? "rounded-bl-md bg-brand-wash text-on-brand-wash"
                      : "ml-auto rounded-br-md bg-surface-muted text-foreground",
                  )}
                >
                  {line}
                </StaggerItem>
              ))}
            </Stagger>
          </Spotlight>
        </StaggerItem>

        {/* Tested recipes: the testers, counted. */}
        <StaggerItem className="lg:col-span-2">
          <Spotlight className={tile}>
            <TileTitle icon={<FlaskConical />} title={TESTED?.title} />
            <p className="mt-4 leading-none">
              <CountUp value={1000} suffix="+" className="vu-figure text-4xl text-foreground" />
              <span className="ml-2 text-xs uppercase tracking-[0.16em] text-foreground-muted">recipe testers</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-foreground-muted">{TESTED?.body}</p>
          </Spotlight>
        </StaggerItem>

        {/* Done-for-you menus: the occasions, then what a menu includes. */}
        <StaggerItem className="md:col-span-2 lg:col-span-4">
          <Spotlight className={tile}>
            <TileTitle icon={<ListChecks />} title={MENUS?.title} />
            <p className="mt-3 text-sm leading-relaxed text-foreground-muted">{MENUS?.body}</p>
            <Stagger as="ul" className="mt-auto grid grid-cols-3 gap-2.5 pt-5">
              {OCCASIONS.map((occasion) => (
                <StaggerItem as="li" key={occasion.label} className="group relative overflow-hidden rounded-xl">
                  {occasion.photo ? (
                    <MediaFrame
                      src={occasion.photo}
                      alt=""
                      aspect="aspect-4/3"
                      rounded="rounded-xl"
                      sizes="(min-width: 1024px) 14vw, 30vw"
                    />
                  ) : (
                    <span className="block aspect-4/3 rounded-xl bg-surface-muted" />
                  )}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-[linear-gradient(to_top,rgba(0,0,0,0.75),transparent)] px-2.5 pb-2 pt-6 text-[12px] font-semibold text-white sm:text-[13px]">
                    {occasion.label}
                  </span>
                </StaggerItem>
              ))}
            </Stagger>
          </Spotlight>
        </StaggerItem>
      </Stagger>
    </section>
  );
}

function TileTitle({ icon, title }: { icon: React.ReactNode; title?: string }) {
  return (
    <h3 className="flex items-center gap-2.5 text-base font-semibold leading-snug text-foreground">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-wash text-on-brand-wash [&_svg]:size-4.5"
        aria-hidden
      >
        {icon}
      </span>
      {title}
    </h3>
  );
}
