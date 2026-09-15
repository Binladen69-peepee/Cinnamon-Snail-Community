import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Globe,
  Heart,
  Leaf,
  Users,
  Utensils,
} from "lucide-react";
import { MemberGlobe } from "@/components/marketing/member-globe";
import { LeafCluster } from "@/components/marketing/hero-decor";
import { MediaFrame } from "@/components/ui/media-frame";
import { CLASS_LIBRARY } from "@/lib/marketing/class-library";
import { communityPostcards } from "@/lib/marketing/community-stories";
import type { GlobeData } from "@/lib/marketing/globe-markers";
import { cn } from "@/lib/utils";

const VALUES = [
  {
    icon: Users,
    title: "Real People",
    body: "Home cooks, chefs, dreamers",
  },
  {
    icon: Utensils,
    title: "Real Kitchens",
    body: "Across the globe",
  },
  {
    icon: BookOpen,
    title: "Real Learning",
    body: "Step by step, together",
  },
  {
    icon: Heart,
    title: "Real Impact",
    body: "Healthier people. Healthier planet.",
  },
] as const;

/**
 * "The Community" — cream split: copy and stats on the left, painted globe
 * with class stills on the right. Geography is city/region only; class cards
 * use spreadsheet stills, never stock faces.
 */
export function CommunityGlobe({
  data,
  classCount = CLASS_LIBRARY.length,
}: {
  data: GlobeData;
  classCount?: number;
}) {
  const cards = communityPostcards(data.markers);
  const countryLabel = data.placeholder || data.countries === 0
    ? null
    : data.countries;

  return (
    <section
      aria-labelledby="community-globe-title"
      className="relative overflow-hidden"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 top-8 w-[220px] text-forest opacity-[0.12] dark:opacity-[0.16]"
      >
        <LeafCluster className="vu-leaf-float w-full" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 bottom-10 w-[200px] rotate-[18deg] text-forest opacity-[0.12] dark:opacity-[0.16]"
      >
        <LeafCluster className="vu-leaf-float w-full" />
      </div>

      <div className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="vu-kicker inline-flex items-center gap-2 text-forest">
            <Leaf className="size-3.5" aria-hidden />
            The community
          </p>
          <h2
            id="community-globe-title"
            className="vu-title-script-sm vu-headline mt-3 text-forest"
          >
            <span className="vu-title-anim">
              Cooks all over the world are already doing this.
            </span>
          </h2>
          <p className="vu-measure mt-5 text-lg leading-relaxed text-foreground-muted">
            Kitchen Table is not one of those online cooking schools. It is a
            global, real-life community of people who are cooking, learning, and
            sharing plant-based food — together.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-3 border-y border-border py-6 sm:gap-6">
            <Stat
              icon={Users}
              value={`${classCount}`}
              label="Classes"
              hint="From weeknights to world cuisine"
            />
            <Stat
              icon={Globe}
              value={countryLabel ? `${countryLabel}` : "Worldwide"}
              label={countryLabel === 1 ? "Country" : "Countries"}
              hint="Real people, real kitchens"
            />
            <Stat
              icon={Leaf}
              value="100%"
              label="Plant-based"
              hint="Good food, kinder planet"
            />
          </dl>

          <div className="mt-8">
            <Link
              href="/community"
              className="vu-cta-fill vu-cta-glow inline-flex h-12 items-center gap-3 rounded-full pl-2 pr-7 text-sm no-underline"
            >
              <span className="grid size-9 place-items-center rounded-full bg-white text-forest dark:bg-paper dark:text-black">
                <ArrowRight className="size-4 vu-cta-arrow" aria-hidden />
              </span>
              Explore the Community
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[36rem] lg:max-w-none">
          <p className="font-hand pointer-events-none absolute -right-1 top-2 z-10 max-w-[11ch] text-right text-2xl leading-tight text-forest md:top-0 md:text-3xl">
            Different places. Same mission.
          </p>

          <div className="relative px-10 py-12 sm:px-16 sm:py-14">
            <svg
              aria-hidden
              viewBox="0 0 400 400"
              className="pointer-events-none absolute inset-6 text-forest/25"
            >
              <path
                d="M70 120C140 80 250 90 330 70"
                fill="none"
                stroke="currentColor"
                strokeDasharray="4 7"
                strokeWidth="1.2"
              />
              <path
                d="M60 280C130 240 220 300 340 250"
                fill="none"
                stroke="currentColor"
                strokeDasharray="4 7"
                strokeWidth="1.2"
              />
            </svg>
            <MemberGlobe
              markers={data.markers}
              placeholder={data.placeholder}
              captionClassName="text-foreground-muted"
            />
            {cards.map((card, index) => (
              <Postcard key={card.title} card={card} index={index} />
            ))}
          </div>
        </div>
      </div>

      <ul className="mt-12 grid gap-6 border-t border-border pt-8 sm:grid-cols-2 lg:grid-cols-4">
        {VALUES.map((item) => (
          <li key={item.title} className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-sage text-forest">
              <item.icon className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block text-sm text-foreground">{item.title}</span>
              <span className="mt-0.5 block text-xs text-foreground-muted">
                {item.body}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {data.placeholder ? (
        <p
          data-asset-needed="member-geo-import"
          className="mt-8 max-w-xl text-xs leading-relaxed text-foreground-muted"
        >
          The pins are stand-ins. Import the Mighty Networks membership export
          with{" "}
          <code className="rounded bg-mint px-1.5 py-0.5">
            pnpm tsx scripts/import-member-geo.ts &lt;export.csv&gt;
          </code>{" "}
          and the real spread appears here.
        </p>
      ) : null}
    </section>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  hint,
}: {
  icon: typeof Users;
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <div className="text-center sm:text-left">
      <Icon className="mx-auto size-5 text-forest sm:mx-0" aria-hidden />
      <dt className="sr-only">{label}</dt>
      <dd className="font-display mt-2 text-3xl text-forest">{value}</dd>
      <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-olive">
        {label}
      </p>
      <p className="mt-1 hidden text-xs leading-snug text-foreground-muted sm:block">
        {hint}
      </p>
    </div>
  );
}

const POSTCARD_PLACE: Array<{ className: string; delay: string }> = [
  { className: "left-0 top-[8%] w-[9.5rem] -rotate-6 sm:w-[10.5rem]", delay: "0s" },
  {
    className: "right-0 top-[12%] w-[9.5rem] rotate-[8deg] sm:w-[10.5rem]",
    delay: "-1.6s",
  },
  {
    className: "bottom-[10%] left-0 w-[9.5rem] rotate-[4deg] sm:w-[10.5rem]",
    delay: "-3.2s",
  },
  {
    className: "bottom-[6%] right-0 w-[9.5rem] -rotate-[5deg] sm:w-[10.5rem]",
    delay: "-4.4s",
  },
];

function Postcard({
  card,
  index,
}: {
  card: { title: string; photo: string; place: string };
  index: number;
}) {
  const place = POSTCARD_PLACE[index];
  if (!place) return null;

  return (
    <Link
      href="/#class-library-heading"
      className={cn(
        "vu-postcard-float absolute z-10 block overflow-hidden rounded-[1.1rem] border border-border bg-surface p-1.5 no-underline shadow-[var(--e2)]",
        place.className,
      )}
      style={{ animationDelay: place.delay }}
    >
      <span className="relative block aspect-[4/3] overflow-hidden rounded-[0.75rem] bg-mint">
        <span className="absolute inset-0">
          <MediaFrame
            src={card.photo}
            alt=""
            aspect="size-full"
            className="size-full"
            rounded="rounded-none"
            reveal={false}
          />
        </span>
      </span>
      <span className="block px-1.5 pb-1.5 pt-2">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-olive">
          {card.place}
        </span>
        <span className="mt-0.5 block line-clamp-2 text-[12px] leading-snug text-foreground">
          {card.title}
        </span>
      </span>
    </Link>
  );
}
