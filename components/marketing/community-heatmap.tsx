import type { HeatmapData } from "@/lib/marketing/heatmap";
import { WORLD_LANDMASS_PATH } from "@/components/marketing/world-path";
import { ScriptAccent } from "@/components/marketing/script-accent";
import { HEADLINE_ACCENTS } from "@/lib/marketing/accent";

/**
 * Where members are, as a glow-density map. General geographic spread only —
 * no names, no exact locations, and no member counts anywhere on the page.
 */
export function CommunityHeatmap({ data }: { data: HeatmapData }) {
  return (
    <div className="vu-card overflow-hidden p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
            The community
          </p>
          <h2 className="vu-headline mt-2 font-display text-2xl font-bold tracking-tight text-forest md:text-3xl">
            <ScriptAccent
              text="Cooks all over the world are already doing this."
              accent={HEADLINE_ACCENTS.heatmap}
            />
          </h2>
        </div>
        {!data.awaitingImport && data.countries > 0 ? (
          <p className="text-sm text-foreground-muted">
            Members in {data.countries}{" "}
            {data.countries === 1 ? "country" : "countries"}
          </p>
        ) : null}
      </div>

      <div className="relative mt-6 overflow-hidden rounded-[1.25rem] bg-forest/95 dark:bg-black dark:ring-1 dark:ring-border">
        <svg
          viewBox="0 0 100 50"
          role="img"
          aria-label="A world map showing the general regions where Vegan University members cook"
          className="block w-full"
        >
          <defs>
            <radialGradient id="heat-glow">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
              <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Landmass silhouette, drawn at low contrast so the glow reads.
              The path is authored in a 100x100 box; equirectangular is 2:1,
              so it is squashed vertically to fit this viewBox. */}
          <g transform="scale(1 0.5)">
            <path
              d={WORLD_LANDMASS_PATH}
              fill="rgba(255,248,239,0.14)"
              stroke="rgba(255,248,239,0.22)"
              strokeWidth="0.24"
            />
          </g>

          {data.points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              // point.y is 0-100 across 180° of latitude; halve it for this box.
              cy={point.y / 2}
              r={0.8 + point.intensity * 2.2}
              fill="url(#heat-glow)"
              opacity={0.45 + point.intensity * 0.5}
            />
          ))}
        </svg>

        {data.awaitingImport ? (
          <div
            data-asset-needed="member-geo-import"
            className="absolute inset-0 grid place-items-center bg-forest/80 px-6 text-center dark:bg-black/85"
          >
            <div className="max-w-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-paper/70">
                Member geography needed
              </p>
              <p className="mt-2 text-sm leading-relaxed text-paper/90">
                This map draws from the real Mighty Networks membership export.
                Import it with{" "}
                <code className="rounded bg-black/30 px-1.5 py-0.5 text-[0.8em]">
                  pnpm tsx scripts/import-member-geo.ts &lt;export.csv&gt;
                </code>{" "}
                and the spread appears here. It is deliberately not drawn from
                local test accounts.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-xs text-foreground-muted">
        Regions only. No names, no exact locations.
      </p>
    </div>
  );
}
