import { Leaf } from "lucide-react";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { CheckoutButton } from "@/components/marketing/checkout-button";
import { StickyCheckout } from "@/components/marketing/sticky-checkout";
import { AmbientEmbers } from "@/components/marketing/ambient-embers";
import { Reveal } from "@/components/marketing/reveal";
import { PhotoSlot } from "@/components/marketing/photo-slot";
import { CourseCatalog } from "@/components/marketing/course-catalog";
import { CommunityHeatmap } from "@/components/marketing/community-heatmap";
import {
  SenjaEmbed,
  SENJA_HOMEPAGE_WIDGET,
} from "@/components/marketing/senja-embed";
import { getCatalogRows, getNextLiveClass } from "@/lib/marketing/catalog";
import { getCommunityHeatmap } from "@/lib/marketing/heatmap";
import { CANCEL_REASSURANCE } from "@/lib/marketing/checkout";
import {
  HOMEPAGE_HERO,
  KITCHEN_TABLE_BLOCK,
  MEMBERSHIP_TEASER,
  PILLAR_CARDS,
} from "@/lib/marketing/copy";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [catalogRows, heatmap, nextLive] = await Promise.all([
    getCatalogRows(),
    getCommunityHeatmap(),
    getNextLiveClass(),
  ]);

  return (
    <div className="overflow-x-clip pb-8">
      {/* Hero ---------------------------------------------------------- */}
      <section className="relative vu-gutter pb-6 pt-10 md:pb-10 md:pt-16">
        <AmbientEmbers />
        <div className="vu-shell relative grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="hero-copy-reveal">
            <p className="inline-flex items-center gap-2 rounded-full bg-sage px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-forest">
              <Leaf className="size-3.5 vu-leaf-drift" aria-hidden />
              A vegan cooking school
            </p>
            <h1 className="vu-headline mt-6 font-display text-[2.1rem] leading-[1.1] font-bold tracking-tight text-forest md:text-[3.25rem] md:leading-[1.06]">
              {HOMEPAGE_HERO.headline}
            </h1>
            <p className="prose-measure mt-6 text-lg leading-relaxed text-foreground-muted">
              {HOMEPAGE_HERO.subhead}
            </p>
            <div className="mt-8">
              <CheckoutButton size="lg" withArrow />
            </div>
            {/* Real testimonial proof, in place of the old avatar strip. */}
            <SenjaEmbed
              widgetId={SENJA_HOMEPAGE_WIDGET}
              title="What members say"
              className="mt-8"
            />
          </div>
          <PhotoSlot id="home-hero" aspect="aspect-[4/5]" rounded="rounded-[1.75rem]" />
        </div>
      </section>

      <StickyCheckout />

      {/* Learn / Cook / Belong ----------------------------------------- */}
      <section className="vu-gutter py-16">
        <div className="vu-shell">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
              What you get
            </p>
            <h2 className="vu-headline mt-3 max-w-[18ch] font-display text-4xl font-bold tracking-tight text-forest md:text-5xl">
              Learn. Cook. Belong.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PILLAR_CARDS.map((pillar, index) => (
              <Reveal key={pillar.title} as="article" delay={index * 90}>
                <div className="vu-card vu-lift h-full overflow-hidden p-4">
                  <PhotoSlot id={pillar.slotId} />
                  <h3 className="mt-5 px-2 font-display text-2xl font-bold tracking-tight text-forest">
                    {pillar.title}
                  </h3>
                  <p className="mt-2 px-2 pb-3 text-sm leading-relaxed text-foreground-muted">
                    {pillar.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Kitchen Table is not a feed ----------------------------------- */}
      <section className="vu-gutter py-8">
        <Reveal>
          <div className="vu-card vu-shell grid overflow-hidden lg:grid-cols-2">
            <PhotoSlot
              id="home-kitchen-table"
              aspect="min-h-[22rem]"
              rounded="rounded-none"
              className="size-full"
            />
            <div className="flex flex-col justify-center px-8 py-12 lg:px-12">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
                The differentiator
              </p>
              <h2 className="vu-headline mt-3 font-display text-3xl font-bold tracking-tight text-forest md:text-4xl">
                Kitchen Table is not a feed. It is the table.
              </h2>
              {KITCHEN_TABLE_BLOCK.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 32)}
                  className="prose-measure mt-5 leading-relaxed text-foreground-muted"
                >
                  {paragraph}
                </p>
              ))}
              <div className="mt-8">
                <CheckoutButton />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Course catalog ------------------------------------------------ */}
      <section className="vu-gutter py-16">
        <div className="vu-shell">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
              The classes
            </p>
            <h2 className="vu-headline mt-3 font-display text-4xl font-bold tracking-tight text-forest">
              Every class, one library.
            </h2>
            {nextLive?.liveAt ? (
              <p className="mt-3 text-sm font-semibold text-forest">
                Next live cook-along: {nextLive.title} on{" "}
                {nextLive.liveAt.toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                })}
                .
              </p>
            ) : null}
          </Reveal>
          <div className="mt-10">
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

      {/* Community heatmap --------------------------------------------- */}
      <section className="vu-gutter py-8">
        <Reveal>
          <div className="vu-shell">
            <CommunityHeatmap data={heatmap} />
          </div>
        </Reveal>
      </section>

      {/* Membership teaser -------------------------------------------- */}
      <section className="vu-gutter py-16">
        <Reveal>
          <div className="vu-card vu-shell grid items-center overflow-hidden lg:grid-cols-2">
            <div className="px-8 py-12 lg:px-12">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
                Membership
              </p>
              <p className="prose-measure mt-5 text-lg leading-relaxed text-foreground">
                {MEMBERSHIP_TEASER.body}
              </p>
              <div className="mt-8">
                <CheckoutButton size="lg" />
              </div>
              <p className="mt-4 text-sm text-foreground-muted">
                {CANCEL_REASSURANCE}
              </p>
            </div>
            <div className="p-4">
              <PhotoSlot
                id="home-membership-teaser"
                aspect="min-h-[20rem]"
                className="h-full"
              />
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ ----------------------------------------------------------- */}
      <section className="vu-gutter pb-16">
        <Reveal>
          <div className="vu-card mx-auto max-w-3xl px-8 py-12">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
              FAQ
            </p>
            <h2 className="vu-headline mt-3 font-display text-3xl font-bold tracking-tight text-forest md:text-4xl">
              Questions, answered plainly
            </h2>
            <div className="mt-6">
              <FaqAccordion />
            </div>
            <div className="mt-10">
              <CheckoutButton />
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
