import Link from "next/link";
import { ArrowRight, BookOpen, Heart, Users, Utensils } from "lucide-react";
import { MediaFrame } from "@/components/ui/media-frame";
import { Reveal } from "@/components/marketing/reveal";
import { CLASS_LIBRARY, libraryShelves, shelfForTitle } from "@/lib/marketing/class-library";
import { communityPostcards } from "@/lib/marketing/community-stories";
import type { GlobeData } from "@/lib/marketing/globe-markers";
import { cn } from "@/lib/utils";

const VALUES = [
  { icon: Users, title: "Real People", body: "Home cooks, chefs, dreamers" },
  { icon: Utensils, title: "Real Kitchens", body: "Across the globe" },
  { icon: BookOpen, title: "Real Learning", body: "Step by step, together" },
  { icon: Heart, title: "Real Impact", body: "Healthier people. Healthier planet." },
] as const;

/** How each of the four stills sits: a slight, deliberate untidiness. */
const TILT = ["-rotate-2 lg:-translate-y-2", "rotate-1 lg:translate-y-4", "rotate-2", "-rotate-1 lg:translate-y-2"];

/**
 * "The community" — copy and facts on one side, four real class stills on the
 * other.
 *
 * This replaces the painted globe. The globe was four hundred lines of SVG
 * with postcards absolutely positioned around it, and at phone widths the
 * postcards overlapped each other, the handwriting clipped at the edge and a
 * placeholder footnote ran under a card. Four photographs of real plates say
 * the same thing with none of that, and they are the product.
 *
 * Every figure here is a count of things, never of people: the sales pages
 * carry no member numbers. Place labels appear only once real geography has
 * been imported; until then the tiles are labelled with the class and its
 * shelf, rather than with a city no member is actually in.
 */
export function CommunitySpread({
  data,
  classCount = CLASS_LIBRARY.length,
}: {
  data: GlobeData;
  classCount?: number;
}) {
  const cards = communityPostcards(data.markers).slice(0, 4);
  const shelves = libraryShelves().length;
  const countries = data.placeholder || data.countries === 0 ? null : data.countries;

  return (
    <section aria-labelledby="community-title" className="relative">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <Reveal>
          <p className="vu-kicker">The community</p>
          <h2 id="community-title" className="vu-title-script-sm vu-headline mt-3 text-foreground">
            <span className="vu-title-anim">Cooks all over the world are already doing this.</span>
          </h2>
          <p className="vu-measure mt-5 text-base leading-relaxed text-foreground-muted md:text-lg">
            Kitchen Table is not one of those online cooking schools. It is a
            global, real-life community of people who are cooking, learning, and
            sharing plant-based food — together.
          </p>

          <dl className="mt-9 grid grid-cols-1 gap-4 border-y border-border py-6 min-[420px]:grid-cols-3 sm:gap-6">
            <Fact value={String(classCount)} label="Classes" hint={`Across ${shelves} shelves`} />
            <Fact
              value={countries ? String(countries) : "Worldwide"}
              label={countries === 1 ? "Country" : "Countries"}
              hint="Real people, real kitchens"
            />
            <Fact value="100%" label="Plant-based" hint="Good food, kinder planet" />
          </dl>

          <div className="mt-8">
            <Link
              href="/community"
              className="vu-cta-fill vu-cta-glow inline-flex h-12 items-center gap-3 rounded-full pl-2 pr-6 text-sm no-underline"
            >
              <span className="grid size-9 place-items-center rounded-full bg-background text-foreground">
                <ArrowRight className="size-4 vu-cta-arrow" aria-hidden />
              </span>
              Explore the Community
            </Link>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4">
            {cards.map((card, index) => (
              <li key={card.title} className={cn("vu-lift-sm", TILT[index])}>
                <MediaFrame
                  src={card.photo}
                  alt={card.title}
                  aspect="aspect-[4/5]"
                  rounded="rounded-[1.25rem]"
                  className="border border-border bg-surface shadow-[var(--e2)]"
                  sizes="(min-width: 1024px) 24vw, 45vw"
                >
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.78),rgba(0,0,0,0)_70%)] px-3 pb-3 pt-10 text-white">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
                      {data.placeholder ? shelfForTitle(card.title) : card.place}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[13px] font-semibold leading-snug">
                      {card.title}
                    </span>
                  </span>
                </MediaFrame>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <ul className="mt-12 grid grid-cols-1 gap-5 border-t border-border pt-8 sm:grid-cols-2 lg:grid-cols-4">
        {VALUES.map((item) => (
          <li key={item.title} className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-foreground">
              <item.icon className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">{item.title}</span>
              <span className="mt-0.5 block text-xs text-foreground-muted">{item.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Fact({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="vu-figure text-3xl text-foreground">{value}</dd>
      <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-foreground-muted">{label}</p>
      <p className="mt-1 text-xs leading-snug text-foreground-muted">{hint}</p>
    </div>
  );
}
