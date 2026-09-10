import { ArrowDown, Leaf } from "lucide-react";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { CheckoutButton } from "@/components/marketing/checkout-button";
import { StickyCheckout } from "@/components/marketing/sticky-checkout";
import { Reveal } from "@/components/marketing/reveal";
import { PhotoSlot } from "@/components/marketing/photo-slot";
import { HeroVideo } from "@/components/marketing/hero-video";
import { PressMarquee } from "@/components/marketing/press-marquee";
import { SocialLinks } from "@/components/marketing/social-links";
import { Reel } from "@/components/marketing/reel";
import { ScrollProgress, Spotlight } from "@/components/marketing/spotlight";
import { CourseCatalog } from "@/components/marketing/course-catalog";
import { CommunityGlobe } from "@/components/marketing/community-globe";
import {
  SenjaEmbed,
  SENJA_HOMEPAGE_WIDGET,
} from "@/components/marketing/senja-embed";
import { getCatalogRows, getNextLiveClass } from "@/lib/marketing/catalog";
import { getGlobeMarkers } from "@/lib/marketing/globe-markers";
import { CANCEL_REASSURANCE } from "@/lib/marketing/checkout";
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
  PILLAR_CARDS,
} from "@/lib/marketing/copy";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [catalogRows, nextLive, globe] = await Promise.all([
    getCatalogRows(),
    getNextLiveClass(),
    getGlobeMarkers(8),
  ]);
  const heroVideo = assetSlot("home-hero");
  const reel = assetSlot("home-reel");
  const totalClasses = catalogRows.reduce(
    (total, row) => total + row.courses.length,
    0,
  );

  return (
    <div className="overflow-x-clip">
      <ScrollProgress />

      {/* Hero — full-bleed video, text-forward ------------------------- */}
      {/* Taller than 16:9 now, which costs a little horizontal crop on the
          background video — acceptable for the extra vertical room.
          data-hero-dark tells the nav to use light type while it is
          transparent over this section. */}
      {/* -mt-18 pulls the hero up under the sticky app bar, which is 72px
          tall and would otherwise sit above it in normal flow — a transparent
          bar would then show cream page background rather than this video. The
          inner column's pt-32 keeps the copy clear of the bar. */}
      <section
        data-hero-dark
        className="relative isolate -mt-18 flex min-h-[calc(clamp(38rem,92svh,54rem)+4.5rem)] items-end overflow-hidden"
      >
        {heroVideo.src ? (
          <HeroVideo src={heroVideo.src} />
        ) : (
          <div className="absolute inset-0 bg-forest" />
        )}

        {/* Corner placement, clear of the app bar overlaying the top of this
            section — the hero's -mt-18 slid it up underneath the bar. */}
        <SocialLinks
          variant="heroDark"
          className="absolute right-5 top-24 z-20 md:right-9 md:top-28"
        />

        <div className="vu-gutter relative z-10 w-full pb-14 pt-32 md:pb-20 md:pt-36">
          <div className="vu-shell hero-copy-reveal">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-md">
              <Leaf className="size-3.5 vu-leaf-drift" aria-hidden />
              A vegan cooking school
            </p>

            <h1 className="vu-title-script vu-headline-invert vu-on-media mt-6 max-w-[26ch] text-white">
              <span className="vu-title-anim">{HOMEPAGE_HERO.headline}</span>
            </h1>

            <p className="vu-measure vu-on-media mt-6 text-lg leading-relaxed text-white/90 md:text-xl">
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

            {/* Real testimonial proof, in place of the old avatar strip. */}
            {/* Literal cream, not the warm-white token: the token inverts to
                near-black in dark mode, and the Senja widget renders its own
                light-themed content, so this card must stay light in both. */}
            <div className="mt-10 max-w-2xl rounded-[1.5rem] bg-[#FFFCF8]/95 p-4 shadow-[0_18px_50px_rgba(6,26,21,0.35)] backdrop-blur-sm">
              <SenjaEmbed
                widgetId={SENJA_HOMEPAGE_WIDGET}
                title="What members say"
              />
            </div>
          </div>
        </div>
      </section>

      <PressMarquee />
      <StickyCheckout />

      {/* Learn / Cook / Belong — editorial, staggered ------------------ */}
      <section className="vu-gutter vu-section">
        <div className="vu-shell">
          <Reveal>
            <p className="vu-kicker">What you get</p>
            <h2 className="vu-title-script-sm vu-headline mt-3 text-forest">
              <span className="vu-title-anim">Learn. Cook. Belong.</span>
            </h2>
          </Reveal>

          <div className="mt-12 grid items-start gap-6 md:grid-cols-3 md:gap-7">
            {PILLAR_CARDS.map((pillar, index) => (
              <Reveal
                key={pillar.title}
                as="article"
                delay={index * 110}
                className={index === 1 ? "md:mt-10" : index === 2 ? "md:mt-20" : ""}
              >
                <Spotlight className="vu-card vu-lift group h-full overflow-hidden rounded-[1.5rem] p-4">
                  <div className="relative overflow-hidden rounded-[1.15rem]">
                    <PhotoSlot id={pillar.slotId} className="vu-zoom" />
                    <span className="absolute left-3 top-3 grid size-9 place-items-center rounded-full bg-forest/85 font-display text-xs font-bold text-paper backdrop-blur-sm">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-5 px-2 font-display text-2xl font-bold tracking-tight text-forest">
                    {pillar.title}
                  </h3>
                  <p className="mt-2.5 px-2 pb-3 text-sm leading-relaxed text-foreground-muted">
                    {pillar.body}
                  </p>
                </Spotlight>
              </Reveal>
            ))}
          </div>
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
                className="vu-zoom"
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
      <section className="vu-gutter vu-section">
        <div className="vu-shell">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="vu-kicker">The classes</p>
                <h2 className="vu-title-script-sm vu-headline mt-3 text-forest">
                  <span className="vu-title-anim">Every class, one library.</span>
                </h2>
              </div>
              {totalClasses > 0 ? (
                <p className="text-sm text-foreground-muted">
                  {totalClasses} classes across {catalogRows.length}{" "}
                  {catalogRows.length === 1 ? "shelf" : "shelves"} — and more
                  every month.
                </p>
              ) : null}
            </div>
          </Reveal>
          <div className="mt-11">
            <CourseCatalog
              rows={catalogRows.map((row) => ({
                category: row.category,
                courses: row.courses.map((course) => ({
                  slug: course.slug,
                  title: course.title,
                  description: course.description,
                  coverUrl: course.coverUrl,
                  teaserVideoUrl: course.teaserVideoUrl,
                  liveAt: course.liveAt ? course.liveAt.toISOString() : null,
                })),
              }))}
            />
          </div>
        </div>
      </section>

      {/* The community — globe as centrepiece --------------------------- */}
      <section className="vu-gutter vu-section-tight">
        <Reveal>
          <div className="vu-shell">
            <CommunityGlobe data={globe} />
          </div>
        </Reveal>
      </section>

      {/* Membership teaser -------------------------------------------- */}
      <section className="vu-gutter vu-section">
        <Reveal>
          <Spotlight className="vu-card vu-shell grid items-center overflow-hidden rounded-[1.75rem] lg:grid-cols-2">
            <div className="px-7 py-12 md:px-11 lg:px-14">
              <h2 className="vu-kicker">Membership</h2>
              <p className="vu-measure mt-5 text-lg leading-relaxed text-foreground md:text-xl">
                {MEMBERSHIP_TEASER.body}
              </p>
              <div className="mt-9">
                <CheckoutButton size="lg" withArrow />
              </div>
              <p className="mt-4 text-sm text-foreground-muted">
                {CANCEL_REASSURANCE}
              </p>
            </div>
            <div className="group p-4">
              <div className="overflow-hidden rounded-[1.4rem]">
                <PhotoSlot
                  id="home-membership-teaser"
                  aspect="min-h-[21rem]"
                  rounded="rounded-none"
                  className="vu-zoom h-full"
                />
              </div>
            </div>
          </Spotlight>
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
