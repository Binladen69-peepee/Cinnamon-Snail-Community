import { CheckoutButton } from "@/components/marketing/checkout-button";
import { StickyCheckout } from "@/components/marketing/sticky-checkout";
import { AmbientEmbers } from "@/components/marketing/ambient-embers";
import { Reveal } from "@/components/marketing/reveal";
import { VideoSlot } from "@/components/marketing/photo-slot";
import { CommunityHeatmap } from "@/components/marketing/community-heatmap";
import {
  SenjaEmbed,
  SENJA_MEMBERSHIP_WIDGET,
} from "@/components/marketing/senja-embed";
import { getCommunityHeatmap } from "@/lib/marketing/heatmap";
import { PRICING } from "@/lib/marketing/checkout";
import { MEMBERSHIP_PAGE } from "@/lib/marketing/copy";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Membership",
  description: MEMBERSHIP_PAGE.subhead,
};

export default async function MembershipPage() {
  const heatmap = await getCommunityHeatmap();

  return (
    <div className="overflow-x-clip pb-8">
      {/* Headline + sales video + credibility -------------------------- */}
      <section className="relative vu-gutter pt-12 pb-8 md:pt-16">
        <AmbientEmbers density={20} />
        <div className="vu-shell relative">
          <div className="hero-copy-reveal mx-auto max-w-3xl text-center">
            <h1 className="vu-headline font-display text-[2rem] leading-[1.12] font-bold tracking-tight text-forest md:text-[3rem] md:leading-[1.08]">
              {MEMBERSHIP_PAGE.headline}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-foreground-muted">
              {MEMBERSHIP_PAGE.subhead}
            </p>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs font-semibold uppercase tracking-[0.12em] text-olive">
              {MEMBERSHIP_PAGE.credibility.map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-sand bg-surface px-3 py-1.5"
                >
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <CheckoutButton size="lg" withArrow />
            </div>
          </div>

          <div className="mx-auto mt-10 max-w-3xl">
            <VideoSlot id="membership-sales-video" />
          </div>
        </div>
      </section>

      <StickyCheckout />

      {/* Opening story -------------------------------------------------- */}
      <section className="vu-gutter py-10">
        <Reveal>
          <div className="mx-auto max-w-2xl">
            {MEMBERSHIP_PAGE.opening.map((paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className="mt-5 text-lg leading-relaxed text-foreground first:mt-0"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </Reveal>
      </section>

      {/* The problem / the turn ---------------------------------------- */}
      {[MEMBERSHIP_PAGE.problem, MEMBERSHIP_PAGE.turn].map((block) => (
        <section key={block.title} className="vu-gutter py-8">
          <Reveal>
            <div className="mx-auto max-w-2xl">
              <h2 className="vu-headline font-display text-3xl font-bold tracking-tight text-forest">
                {block.title}
              </h2>
              {block.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 32)}
                  className="mt-5 leading-relaxed text-foreground-muted"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </Reveal>
        </section>
      ))}

      {/* What's inside -------------------------------------------------- */}
      <section className="vu-gutter py-12">
        <div className="vu-shell">
          <Reveal>
            <h2 className="vu-headline font-display text-3xl font-bold tracking-tight text-forest md:text-4xl">
              What&rsquo;s inside
            </h2>
          </Reveal>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {MEMBERSHIP_PAGE.inside.map((item, index) => (
              <Reveal key={item.title} as="article" delay={index * 70}>
                <div className="vu-card vu-lift h-full p-6">
                  <h3 className="font-display text-xl font-bold tracking-tight text-forest">
                    {item.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-foreground-muted">
                    {item.body}
                  </p>
                </div>
              </Reveal>
            ))}
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

      {/* Social proof --------------------------------------------------- */}
      <section className="vu-gutter py-8">
        <Reveal>
          <div className="vu-shell">
            <SenjaEmbed
              widgetId={SENJA_MEMBERSHIP_WIDGET}
              title="What members say"
            />
          </div>
        </Reveal>
      </section>

      {/* Pricing -------------------------------------------------------- */}
      <section className="vu-gutter py-10">
        <Reveal>
          <div className="vu-card mx-auto max-w-2xl px-8 py-12 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
              Pricing
            </p>
            <p className="mt-4 font-display text-4xl font-bold tracking-tight text-forest">
              {PRICING.monthly}
            </p>
            <p className="mt-2 text-foreground-muted">cancel whenever you want.</p>
            <p className="mt-6 text-lg text-foreground">
              Or pay yearly at{" "}
              <span className="font-display font-bold text-forest">
                {PRICING.yearly}
              </span>
              , {PRICING.yearlyNote}.
            </p>
            <div className="mt-8">
              <CheckoutButton size="lg" />
            </div>
          </div>
        </Reveal>
      </section>

      {/* The close ------------------------------------------------------ */}
      <section className="vu-gutter pb-16">
        <Reveal>
          <div className="mx-auto max-w-2xl">
            <h2 className="vu-headline font-display text-3xl font-bold tracking-tight text-forest">
              {MEMBERSHIP_PAGE.close.title}
            </h2>
            {MEMBERSHIP_PAGE.close.paragraphs.map((paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className="mt-5 leading-relaxed text-foreground-muted"
              >
                {paragraph}
              </p>
            ))}
            <div className="mt-8">
              <CheckoutButton size="lg" />
            </div>
            <p className="mt-8 leading-relaxed text-foreground-muted">
              {MEMBERSHIP_PAGE.close.afterCta}
            </p>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
