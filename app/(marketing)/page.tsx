import { ArrowDown, Leaf } from "lucide-react";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { CheckoutButton } from "@/components/marketing/checkout-button";
import { StickyCheckout } from "@/components/marketing/sticky-checkout";
import { Reveal } from "@/components/marketing/reveal";
import { PhotoSlot } from "@/components/marketing/photo-slot";
import { HeroImage } from "@/components/marketing/hero-image";
import { PressMarquee } from "@/components/marketing/press-marquee";
import { Reel } from "@/components/marketing/reel";
import { ScrollProgress } from "@/components/marketing/spotlight";
import { ClassLibrary } from "@/components/marketing/class-library";
import { CommunityGlobe } from "@/components/marketing/community-globe";
import { MembershipPlans } from "@/components/marketing/membership-plans";
import { WhatYouGet } from "@/components/marketing/what-you-get";
import {
  SenjaEmbed,
  SENJA_HOMEPAGE_WIDGET,
} from "@/components/marketing/senja-embed";
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
  MEMBERSHIP_TEASER,
} from "@/lib/marketing/copy";

export const dynamic = "force-dynamic";

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

      {/* Hero — full-bleed photograph, text-forward --------------------- */}
      {/* data-hero-dark tells the nav to use light type while it is
          transparent over this section. */}
      {/* -mt-18 pulls the hero up under the sticky app bar, which is 72px
          tall and would otherwise sit above it in normal flow — a transparent
          bar would then show cream page background rather than the photo. The
          inner column's pt-32 keeps the copy clear of the bar. */}
      <section
        data-hero-dark
        className="relative isolate -mt-18 flex min-h-[calc(clamp(38rem,92svh,54rem)+4.5rem)] items-end overflow-hidden"
      >
        {hero.src ? (
          <HeroImage src={hero.src} alt={hero.alt} />
        ) : (
          <div className="absolute inset-0 bg-forest" />
        )}

        <div className="vu-gutter relative z-10 w-full pb-14 pt-32 md:pb-20 md:pt-36">
          <div className="vu-shell hero-copy-reveal">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-md">
              <Leaf className="size-3.5 vu-leaf-drift" aria-hidden />
              A vegan cooking school
            </p>

            <h1 className="vu-title-script vu-headline-invert vu-on-media mt-6 max-w-[26ch] text-white">
              {HOMEPAGE_HERO.headline}
            </h1>

            <p className="vu-hero-live-title vu-measure vu-on-media mt-6 text-white">
              {HOMEPAGE_HERO.subhead}
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-5">
              <CheckoutButton size="lg" withArrow />
              <span className="hidden items-center gap-2 text-sm text-white/70 sm:flex">
                <ArrowDown className="size-4 animate-bounce" aria-hidden />
                {nextLive?.liveAt
                  ? `Next live cook-along ${nextLive.liveAt.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`
                  : "Scroll for the class library"}
              </span>
            </div>

            <div className="vu-hero-proof mt-8">
              <SenjaEmbed
                widgetId={SENJA_HOMEPAGE_WIDGET}
                title="What members say"
                wash={false}
              />
            </div>
          </div>
        </div>
      </section>

      <PressMarquee />
      <StickyCheckout />

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
            <div className="group relative min-h-[20rem] overflow-hidden">
              <PhotoSlot
                id="home-kitchen-table"
                aspect="absolute inset-0 size-full"
                rounded="rounded-none"
              />
            </div>
            <div className="flex flex-col justify-center px-7 py-12 md:px-11 lg:px-14">
              <p className="vu-kicker">The differentiator</p>
              <h2 className="vu-title-script-sm vu-headline-invert mt-3 text-paper">
                <span className="vu-title-anim">
                  Kitchen Table is not a feed. It is the table.
                </span>
              </h2>
              {KITCHEN_TABLE_BLOCK.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 32)}
                  className="vu-measure mt-5 leading-relaxed text-paper/80"
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
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-14">
              {reel.src ? (
                <Reel src={reel.src} label="Adam, on what's actually inside" />
              ) : null}

              <div>
                <p className="vu-kicker">{REEL_KICKER}</p>
                <blockquote
                  id="adam-reel"
                  className="vu-title-script-sm vu-headline mt-4 text-forest"
                >
                  <span className="vu-title-anim">&ldquo;{REEL_QUOTE}&rdquo;</span>
                </blockquote>
                <p className="vu-measure mt-6 text-lg leading-relaxed text-foreground-muted">
                  {REEL_SUPPORT}
                </p>
                <div className="mt-8">
                  <CheckoutButton size="lg" withArrow />
                </div>
                <details className="group mt-7 max-w-prose">
                  <summary className="cursor-pointer text-sm font-semibold text-olive underline-offset-4 hover:underline">
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
                  className="vu-title-script-sm vu-headline mt-3 text-forest"
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
          <div className="mt-11">
            <ClassLibrary />
          </div>
        </div>
      </section>

      {/* The community — globe as centrepiece --------------------------- */}
      <div className="vu-gutter vu-section">
        <Reveal>
          <div className="vu-feed-shell">
            <CommunityGlobe data={globe} />
          </div>
        </Reveal>
      </div>

      {/* Membership teaser -------------------------------------------- */}
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
          <div className="vu-card mx-auto max-w-3xl rounded-[1.75rem] px-7 py-12 md:px-11">
            <p className="vu-kicker">FAQ</p>
            <h2 className="vu-title-script-sm vu-headline mt-3 text-forest">
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
