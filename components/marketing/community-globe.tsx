import { MemberGlobe } from "@/components/marketing/member-globe";
import type { GlobeData } from "@/lib/marketing/globe-markers";

/**
 * "The Community" — a full-width dark panel with the globe as its centrepiece.
 *
 * This replaces the flat SVG world map that sat in an empty card. The globe is
 * the focal point, so it gets the middle of the panel at a size that carries a
 * section on its own, with the copy stacked above it and the supporting notes
 * beneath.
 *
 * General geographic spread only — city or region at the finest, no names, and
 * no member counts anywhere on the sales pages. The country count is a count of
 * places, not of people, which is why it is allowed.
 */
export function CommunityGlobe({ data }: { data: GlobeData }) {
  return (
    <section
      aria-labelledby="community-globe-title"
      className="relative overflow-hidden rounded-[2rem]"
    >
      {/* Deep teal ground, so the globe's glow has something to sit against. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,#0d3b36_0%,#07211f_55%,#041413_100%)]"
      />
      <div aria-hidden className="vu-grain absolute inset-0 opacity-30" />

      <div className="relative px-6 py-14 md:px-10 md:py-18">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300/80">
            The community
          </p>
          <h2
            id="community-globe-title"
            className="vu-title-script-sm vu-headline-invert mt-3 text-paper"
          >
            <span className="vu-title-anim">
              Cooks all over the world are already doing this.
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl leading-relaxed text-paper/70">
            Kitchen Table is not one time zone. Somebody is always mid-cook,
            which is why the answer to your 9pm sauce question tends to arrive
            before dinner is cold.
          </p>
        </div>

        {/* The centrepiece. */}
        <div className="mx-auto mt-10 w-full max-w-[38rem] md:mt-12 lg:max-w-[44rem]">
          <MemberGlobe markers={data.markers} placeholder={data.placeholder} />
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-6 border-t border-cyan-300/10 pt-8 text-center sm:grid-cols-3">
          <div>
            <p className="font-display text-2xl font-bold text-paper">
              {data.placeholder ? "—" : data.countries}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-paper/50">
              {data.countries === 1 ? "Country" : "Countries"}
            </p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-paper">Every week</p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-paper/50">
              A live cook-along
            </p>
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-paper">Regions only</p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-paper/50">
              No names, no addresses
            </p>
          </div>
        </div>

        {data.placeholder ? (
          <p
            data-asset-needed="member-geo-import"
            className="mx-auto mt-8 max-w-xl rounded-2xl border border-cyan-300/15 bg-black/20 px-5 py-4 text-center text-xs leading-relaxed text-paper/70"
          >
            The pins are stand-ins. This map draws from the real Mighty Networks
            membership export — import it with{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5">
              pnpm tsx scripts/import-member-geo.ts &lt;export.csv&gt;
            </code>{" "}
            and the real spread appears here. It is deliberately not drawn from
            local test accounts.
          </p>
        ) : null}
      </div>
    </section>
  );
}
