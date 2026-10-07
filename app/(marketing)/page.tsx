import { Leaf, MessageCircle, ShieldCheck, Utensils } from "lucide-react";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { CheckoutButton } from "@/components/marketing/checkout-button";
import { StickyCheckout } from "@/components/marketing/sticky-checkout";

import { Rise, Stagger, StaggerItem } from "@/components/marketing/motion";
import { PhotoSlot } from "@/components/marketing/photo-slot";
import { HeroImage } from "@/components/marketing/hero-image";
import { HeroWords } from "@/components/marketing/hero-words";
import { PressMarquee } from "@/components/marketing/press-marquee";
import { Reel } from "@/components/marketing/reel";
import { ScrollProgress } from "@/components/marketing/spotlight";
import { ClassLibrary } from "@/components/marketing/class-library";
import { CommunitySpread } from "@/components/marketing/community-spread";
import { MembershipPlans } from "@/components/marketing/membership-plans";
import { WhatsInside } from "@/components/marketing/whats-inside";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { SenjaEmbed, SENJA_HOMEPAGE_WIDGET } from "@/components/marketing/senja-embed";
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

/**
 * What sets the Kitchen Table apart, in phrases lifted from its signed-off
 * paragraphs, floated over its photograph.
 */
const TABLE_POINTS = [
  { icon: Utensils, text: "Post the plate" },
  { icon: MessageCircle, text: "No algorithm decides who gets seen" },
  { icon: ShieldCheck, text: "Hosts keep it useful, not chaotic" },
] as const;

export default async function HomePage() {
  const globe = await getGlobeMarkers(8);
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

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 sm:mt-8">
              <CheckoutButton size="lg" withArrow />
            </div>

            <div className="mt-5 flex flex-wrap items-stretch gap-3 sm:mt-7">
              {/* The wrapper carries the breakpoint, not the widget, which
                  sets its own `display`. No white chip any more: the widget
                  sits on the photograph with a faint glow and white type
                  (see `onPhoto` in senja-embed.tsx), in the chip's old box so
                  nothing around it moves. */}
              <div className="hidden self-center sm:block">
                <SenjaEmbed
                  widgetId={SENJA_HOMEPAGE_WIDGET}
                  title="What members say"
                  onPhoto
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <PressMarquee />
      <StickyCheckout />

      {/* What's inside: the five parts, each with what it actually is ------- */}
      <section className="vu-gutter vu-section">
        <div className="vu-feed-shell">
          <WhatsInside />
        </div>
      </section>

      {/* How it works: Learn, Cook, Belong as three steps ------------------ */}
      <section className="vu-gutter vu-section pt-0">
        <div className="vu-feed-shell">
          <HowItWorks />
        </div>
      </section>

      {/* Kitchen Table — dark panel for contrast rhythm ---------------- */}
      <section className="vu-gutter vu-section-tight">
        <Rise>
          <div className="vu-panel-dark vu-shell grid items-center gap-8 overflow-hidden rounded-[1.75rem] p-5 sm:p-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12 lg:p-12">
            {/* The panel is dark in both themes, so its ink is white in both:
                literal classes, not tokens, or it inverts out of existence. */}
            <div className="order-2 lg:order-1">
              <p className="vu-kicker">The differentiator</p>
              <h2 className="vu-title-script-sm vu-headline-invert mt-3 text-white">
                <span className="vu-title-anim">Kitchen Table is not a feed. It is the table.</span>
              </h2>
              {KITCHEN_TABLE_BLOCK.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 32)}
                  className="vu-measure mt-4 text-[15px] leading-relaxed text-white/75"
                >
                  {paragraph}
                </p>
              ))}
              <div className="mt-8">
                <CheckoutButton tone="onDark" withArrow />
              </div>
            </div>

            <div className="relative order-1 lg:order-2">
              <div className="overflow-hidden rounded-[1.35rem]">
                <PhotoSlot
                  id="home-kitchen-table"
                  aspect="aspect-[4/3] lg:aspect-[4/5]"
                  rounded="rounded-[1.35rem]"
                />
              </div>
              <Stagger as="ul" className="absolute inset-x-3 bottom-3 flex flex-col items-start gap-2 sm:inset-x-5 sm:bottom-5">
                {TABLE_POINTS.map((point, index) => (
                  <StaggerItem
                    as="li"
                    key={point.text}
                    className={index % 2 ? "vu-float-slow self-end" : "vu-float-slow"}
                  >
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/65 px-3.5 py-2 text-[13px] font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-md">
                      <point.icon className="size-4 shrink-0" aria-hidden />
                      {point.text}
                    </span>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </div>
        </Rise>
      </section>

      {/* From Adam's kitchen — vertical reel --------------------------- */}
      <section className="vu-gutter vu-section" aria-labelledby="adam-reel">
        <div className="vu-shell">
          <Rise>
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
          </Rise>
        </div>
      </section>

      {/* Course catalog ------------------------------------------------ */}
      <section className="vu-gutter vu-section" aria-labelledby="class-library-heading">
        <div className="vu-feed-shell">
          <Rise>
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
          </Rise>
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
        <Rise>
          <div className="vu-feed-shell">
            <MembershipPlans
              heading="Monthly or yearly."
              body={MEMBERSHIP_TEASER.body}
              slides={membershipGallery()}
            />
          </div>
        </Rise>
      </section>

      {/* FAQ ----------------------------------------------------------- */}
      <section className="vu-gutter vu-section pt-0">
        <Rise>
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
        </Rise>
      </section>
    </div>
  );
}
