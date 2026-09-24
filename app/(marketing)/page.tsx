import {
  ArrowDown,
  BookOpen,
  CalendarDays,
  ChefHat,
  FlaskConical,
  Leaf,
  ListChecks,
  Users,
} from "lucide-react";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { CheckoutButton } from "@/components/marketing/checkout-button";
import { StickyCheckout } from "@/components/marketing/sticky-checkout";
import { Reveal } from "@/components/marketing/reveal";
import { PhotoSlot } from "@/components/marketing/photo-slot";
import { HeroImage } from "@/components/marketing/hero-image";
import { HeroWords } from "@/components/marketing/hero-words";
import { PressMarquee } from "@/components/marketing/press-marquee";
import { Reel } from "@/components/marketing/reel";
import { ScrollProgress } from "@/components/marketing/spotlight";
import { ClassLibrary } from "@/components/marketing/class-library";
import { CommunitySpread } from "@/components/marketing/community-spread";
import { MembershipPlans } from "@/components/marketing/membership-plans";
import { WhatYouGet } from "@/components/marketing/what-you-get";
import { SenjaEmbed, SENJA_HOMEPAGE_WIDGET } from "@/components/marketing/senja-embed";
import { getNextLiveClass } from "@/lib/marketing/catalog";
import { CLASS_LIBRARY, libraryShelves, membershipGallery } from "@/lib/marketing/class-library";
import { getGlobeMarkers } from "@/lib/marketing/globe-markers";
import {
  REEL_KICKER,
  REEL_QUOTE,
  REEL_SUPPORT,
  REEL_TRANSCRIPT,
  assetSlot,
} from "@/lib/marketing/assets";
import {
  HOMEPAGE_HERO,
  KITCHEN_TABLE_BLOCK,
  MEMBERSHIP_PAGE,
  MEMBERSHIP_TEASER,
} from "@/lib/marketing/copy";

export const dynamic = "force-dynamic";

/** The five things inside, as the signed-off copy names them. */
const INSIDE_ICONS = [CalendarDays, BookOpen, Users, FlaskConical, ListChecks] as const;

export default async function HomePage() {
  const [nextLive, globe] = await Promise.all([
    getNextLiveClass(),
    getGlobeMarkers(8),
  ]);
  const hero = assetSlot("home-hero");
  const reel = assetSlot("home-reel");
  const totalClasses = CLASS_LIBRARY.length;
  const shelfCount = libraryShelves().length;

  return (
    <div className="overflow-x-clip">
      <ScrollProgress />

      {/* Hero ------------------------------------------------------------ */}
      {/* data-hero-dark tells the nav to use light type while it is
          transparent over this section, and tells the sticky bar what to wait
          for. -mt-18 cancels the 72px the bar takes in flow, so the
          photograph starts at the very top of the page and the bar sits over
          it; the inner column's top padding keeps the copy clear.
          Because the margin nets the section's top to zero, its height is the
          height you see: on a phone exactly one screen, so the headline, the
          subhead and the button all land above the fold. It used to add the
          bar's height back on top, which pushed the last card 72px under it. */}
      <section
        data-hero-dark
        className="relative isolate -mt-18 flex min-h-[100svh] items-end overflow-hidden sm:min-h-[clamp(38rem,92svh,52rem)]"
      >
        {hero.src ? (
          <HeroImage src={hero.src} alt={hero.alt} />
        ) : (
          // White copy over a photograph; the plate behind it stays dark in
          // both themes, so it is a literal rather than a token that inverts.
          <div className="absolute inset-0 bg-black" />
        )}

        <div className="vu-gutter relative z-10 w-full pb-9 pt-24 sm:pb-12 sm:pt-28 md:pb-16 md:pt-36">
          <div className="vu-shell hero-copy-reveal">
            <p className="vu-glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em]">
              <Leaf className="size-3.5" aria-hidden />
              A vegan cooking school
            </p>

            <h1
              aria-label={HOMEPAGE_HERO.headline}
              className="vu-title-brush vu-on-media mt-4 max-w-[19ch] text-white sm:mt-5 sm:max-w-[22ch]"
            >
              <HeroWords text={HOMEPAGE_HERO.headline} />
            </h1>

            <p className="vu-hero-live-title vu-measure vu-on-media mt-4 text-white/90 sm:mt-5">
              {HOMEPAGE_HERO.subhead}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 sm:mt-8">
              <CheckoutButton size="lg" withArrow />
              <a
                href="#class-library-heading"
                className="hidden items-center gap-2 text-sm text-white/75 no-underline transition hover:text-white sm:flex"
              >
                <ArrowDown className="size-4 animate-bounce" aria-hidden />
                See the class library
              </a>
            </div>

            {/* A live date is the most concrete reason to join this week, so
                it gets its own card when there is one. Without one the card
                states the size of the library instead, which is also true. */}
            <div className="mt-5 flex flex-wrap items-stretch gap-3 sm:mt-7">
              <div className="vu-glass flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-black">
                  {nextLive?.liveAt ? (
                    <CalendarDays className="size-4" aria-hidden />
                  ) : (
                    <ChefHat className="size-4" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/70">
                    {nextLive?.liveAt ? "Next live cook-along" : "On demand"}
                  </span>
                  <span className="block truncate text-[14px] font-semibold text-white">
                    {nextLive?.liveAt
                      ? `${nextLive.title} · ${nextLive.liveAt.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`
                      : `${totalClasses} classes across ${shelfCount} shelves`}
                  </span>
                </span>
              </div>

              {/* The wrapper carries the breakpoint, not the chip:
                  `.vu-hero-proof` sets its own `display` later in the
                  stylesheet, so a `hidden` utility on the same element loses
                  at equal specificity and the chip stayed on screen. */}
              <div className="hidden self-center sm:block">
                <div className="vu-hero-proof">
                  <SenjaEmbed
                    widgetId={SENJA_HOMEPAGE_WIDGET}
                    title="What members say"
                    wash={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PressMarquee />
      <StickyCheckout />

      {/* What's inside — the five things, in the client's own words -------- */}
      <section className="vu-gutter pt-10 md:pt-14" aria-label="What is inside">
        <div className="vu-feed-shell">
          <Reveal>
            <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5">
              {MEMBERSHIP_PAGE.inside.map((item, index) => {
                const Icon = INSIDE_ICONS[index] ?? BookOpen;
                return (
                  <li
                    key={item.title}
                    className="vu-lift-sm flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="text-[13.5px] font-semibold leading-snug text-foreground">
                      {item.title}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Learn / Cook / Belong ----------------------------------------- */}
      <section className="vu-gutter vu-section">
        <div className="vu-feed-shell">
          <WhatYouGet />
        </div>
      </section>

      {/* Kitchen Table — dark panel for contrast rhythm ---------------- */}
      <section className="vu-gutter vu-section-tight">
        <Reveal>
          <div className="vu-panel-dark vu-shell grid overflow-hidden rounded-[1.75rem] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="group relative min-h-[16rem] overflow-hidden sm:min-h-[20rem]">
              <PhotoSlot
                id="home-kitchen-table"
                aspect="absolute inset-0 size-full"
                rounded="rounded-none"
              />
            </div>
            {/* The panel is dark in both themes, so its ink is white in both:
                literal classes, not tokens, or it inverts out of existence. */}
            <div className="flex flex-col justify-center px-5 py-9 sm:px-7 sm:py-12 md:px-11 lg:px-14">
              <p className="vu-kicker">The differentiator</p>
              <h2 className="vu-title-script-sm vu-headline-invert mt-3 text-white">
                <span className="vu-title-anim">Kitchen Table is not a feed. It is the table.</span>
              </h2>
              {KITCHEN_TABLE_BLOCK.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 32)}
                  className="vu-measure mt-5 leading-relaxed text-white/80"
                >
                  {paragraph}
                </p>
              ))}
              <div className="mt-9">
                <CheckoutButton tone="onDark" withArrow />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* From Adam's kitchen — vertical reel --------------------------- */}
      <section className="vu-gutter vu-section" aria-labelledby="adam-reel">
        <div className="vu-shell">
          <Reveal>
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-14">
              {reel.src ? (
                <Reel src={reel.src} label="Adam, on what's actually inside" />
              ) : null}

              <div>
                <p className="vu-kicker">{REEL_KICKER}</p>
                <blockquote
                  id="adam-reel"
                  className="vu-title-script-sm vu-headline mt-4 text-foreground"
                >
                  <span className="vu-title-anim">&ldquo;{REEL_QUOTE}&rdquo;</span>
                </blockquote>
                <p className="vu-measure mt-6 text-base leading-relaxed text-foreground-muted md:text-lg">
                  {REEL_SUPPORT}
                </p>
                <div className="mt-8">
                  <CheckoutButton size="lg" withArrow />
                </div>
                <details className="group mt-7 max-w-prose">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground-muted underline-offset-4 hover:underline">
                    Read the transcript
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
                    {REEL_TRANSCRIPT}
                  </p>
                </details>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Course catalog ------------------------------------------------ */}
      <section className="vu-gutter vu-section" aria-labelledby="class-library-heading">
        <div className="vu-feed-shell">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="vu-kicker">The classes</p>
                <h2
                  id="class-library-heading"
                  className="vu-title-script-sm vu-headline mt-3 text-foreground"
                >
                  <span className="vu-title-anim">Every class, one library.</span>
                </h2>
              </div>
              {totalClasses > 0 ? (
                <p className="text-sm text-foreground-muted">
                  {totalClasses} classes across {shelfCount}{" "}
                  {shelfCount === 1 ? "shelf" : "shelves"}
                </p>
              ) : null}
            </div>
          </Reveal>
          <div className="mt-9 md:mt-11">
            <ClassLibrary />
          </div>
        </div>
      </section>

      {/* The community -------------------------------------------------- */}
      <div className="vu-gutter vu-section">
        <div className="vu-feed-shell">
          <CommunitySpread data={globe} />
        </div>
      </div>

      {/* Membership ---------------------------------------------------- */}
      <section className="vu-gutter vu-section">
        <Reveal>
          <div className="vu-feed-shell">
            <MembershipPlans
              heading="Monthly or yearly."
              body={MEMBERSHIP_TEASER.body}
              slides={membershipGallery()}
            />
          </div>
        </Reveal>
      </section>

      {/* FAQ ----------------------------------------------------------- */}
      <section className="vu-gutter vu-section pt-0">
        <Reveal>
          <div className="vu-card mx-auto max-w-3xl rounded-[1.75rem] px-5 py-9 sm:px-7 sm:py-12 md:px-11">
            <p className="vu-kicker">FAQ</p>
            <h2 className="vu-title-script-sm vu-headline mt-3 text-foreground">
              <span className="vu-title-anim">Questions, answered plainly</span>
            </h2>
            <div className="mt-7">
              <FaqAccordion />
            </div>
            <div className="mt-10">
              <CheckoutButton size="lg" withArrow />
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
