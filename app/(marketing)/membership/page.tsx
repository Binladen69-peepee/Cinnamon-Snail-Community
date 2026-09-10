import { CheckoutButton } from "@/components/marketing/checkout-button";
import { StickyCheckout } from "@/components/marketing/sticky-checkout";
import { AmbientEmbers } from "@/components/marketing/ambient-embers";
import { Reveal } from "@/components/marketing/reveal";
import { VideoSlot } from "@/components/marketing/photo-slot";
import { ScrollProgress, Spotlight } from "@/components/marketing/spotlight";
import { SocialLinks } from "@/components/marketing/social-links";
import { ScriptAccent } from "@/components/marketing/script-accent";
import { CommunityHeatmap } from "@/components/marketing/community-heatmap";
import {
  SenjaEmbed,
  SENJA_MEMBERSHIP_WIDGET,
} from "@/components/marketing/senja-embed";
import { getCommunityHeatmap } from "@/lib/marketing/heatmap";
import { PRICING } from "@/lib/marketing/checkout";
import { MEMBERSHIP_PAGE } from "@/lib/marketing/copy";
import { HEADLINE_ACCENTS } from "@/lib/marketing/accent";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Membership",
  description: MEMBERSHIP_PAGE.subhead,
};

export default async function MembershipPage() {
  const heatmap = await getCommunityHeatmap();

  return (
    <div className="overflow-x-clip">
      <ScrollProgress />

      {/* Headline, credibility, sales video ---------------------------- */}
      <section className="relative vu-gutter pb-10 pt-14 md:pt-20">
        <AmbientEmbers density={20} />
        {/* Corner placement, mirroring the homepage hero. */}
        <SocialLinks
          variant="heroLight"
          className="absolute right-5 top-4 z-20 md:right-9 md:top-6"
        />
        <div className="vu-shell relative">
          <div className="hero-copy-reveal mx-auto max-w-4xl text-center">
            <h1 className="vu-display vu-headline text-forest">
              <ScriptAccent
                text={MEMBERSHIP_PAGE.headline}
                accent={HEADLINE_ACCENTS.membershipHero}
              />
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-foreground-muted md:text-xl">
              {MEMBERSHIP_PAGE.subhead}
            </p>
            <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-olive">
              {MEMBERSHIP_PAGE.credibility.map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-sand bg-surface px-3.5 py-2"
                >
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-9">
              <CheckoutButton size="lg" withArrow />
            </div>
          </div>

          {/* Adam, straight to camera — trust before copy. */}
          <div className="mt-12">
            <VideoSlot id="membership-sales-video" />
            <p className="mx-auto mt-4 max-w-sm text-center text-xs text-foreground-muted">
              <span className="vu-script text-accent">Hey, it&rsquo;s Adam</span> — a
              minute from my kitchen on what this actually is.
            </p>
          </div>
        </div>
      </section>

      <StickyCheckout />

      {/* Opening story -------------------------------------------------- */}
      <section className="vu-gutter vu-section-tight">
        <Reveal>
          <div className="mx-auto max-w-2xl">
            {MEMBERSHIP_PAGE.opening.map((paragraph, index) => (
              <p
                key={paragraph.slice(0, 32)}
                className={
                  index === 0
                    ? "text-xl leading-relaxed text-foreground md:text-[1.4rem] md:leading-relaxed"
                    : "mt-5 text-lg leading-relaxed text-foreground-muted"
                }
              >
                {paragraph}
              </p>
            ))}
          </div>
        </Reveal>
      </section>

      {/* The problem / the turn ---------------------------------------- */}
      {[MEMBERSHIP_PAGE.problem, MEMBERSHIP_PAGE.turn].map((block) => (
        <section key={block.title} className="vu-gutter vu-section-tight">
          <Reveal>
            <div className="mx-auto max-w-2xl">
              <h2 className="vu-kicker">{block.title}</h2>
              <div className="mt-4">
                {block.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph.slice(0, 32)}
                    className="mt-5 leading-relaxed text-foreground-muted first:mt-0"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </Reveal>
        </section>
      ))}

      {/* What's inside -------------------------------------------------- */}
      <section className="vu-gutter vu-section">
        <div className="vu-shell">
          <Reveal>
            <p className="vu-kicker">Inside the membership</p>
            <h2 className="vu-display-sm vu-headline mt-3 text-forest">
              What&rsquo;s{" "}
              <ScriptAccent text="inside" accent={HEADLINE_ACCENTS.whatsInside} />
            </h2>
          </Reveal>
          <div className="mt-9 grid gap-5 md:grid-cols-2">
            {MEMBERSHIP_PAGE.inside.map((item, index) => (
              <Reveal
                key={item.title}
                as="article"
                delay={index * 80}
                className={index === 4 ? "md:col-span-2" : ""}
              >
                <Spotlight className="vu-card vu-lift h-full rounded-[1.5rem] p-6 md:p-7">
                  <span className="font-display text-xs font-bold tracking-[0.2em] text-accent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 font-display text-xl font-bold tracking-tight text-forest">
                    {item.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-foreground-muted">
                    {item.body}
                  </p>
                </Spotlight>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Community heatmap --------------------------------------------- */}
      <section className="vu-gutter vu-section-tight">
        <Reveal>
          <div className="vu-shell">
            <CommunityHeatmap data={heatmap} />
          </div>
        </Reveal>
      </section>

      {/* Social proof --------------------------------------------------- */}
      <section className="vu-gutter vu-section-tight">
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
      <section className="vu-gutter vu-section-tight">
        <Reveal>
          <div className="vu-panel-dark mx-auto max-w-2xl rounded-[1.75rem] px-8 py-14 text-center">
            <h2 className="vu-kicker">Pricing</h2>
            <p className="mt-4 font-display text-5xl font-bold tracking-tight text-paper">
              {PRICING.monthly}
            </p>
            <p className="mt-2 text-paper/70">cancel whenever you want.</p>
            <p className="mt-7 text-lg text-paper/90">
              Or pay yearly at{" "}
              <span className="font-display font-bold text-paper">
                {PRICING.yearly}
              </span>
              , {PRICING.yearlyNote}.
            </p>
            <div className="mt-9">
              <CheckoutButton size="lg" tone="onDark" withArrow />
            </div>
          </div>
        </Reveal>
      </section>

      {/* The close ------------------------------------------------------ */}
      <section className="vu-gutter vu-section">
        <Reveal>
          <div className="mx-auto max-w-2xl">
            <h2 className="vu-kicker">{MEMBERSHIP_PAGE.close.title}</h2>
            {MEMBERSHIP_PAGE.close.paragraphs.map((paragraph) => (
              <p
                key={paragraph.slice(0, 32)}
                className="mt-5 text-lg leading-relaxed text-foreground"
              >
                {paragraph}
              </p>
            ))}
            <div className="mt-9">
              <CheckoutButton size="lg" withArrow />
            </div>
            <p className="mt-10 border-t border-sand pt-8 leading-relaxed text-foreground-muted">
              {MEMBERSHIP_PAGE.close.afterCta}
            </p>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
