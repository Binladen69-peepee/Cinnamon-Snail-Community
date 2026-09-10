import { prisma } from "@/lib/db";

export type HeatPoint = {
  /** Equirectangular projection, 0–100 of the SVG viewport. */
  x: number;
  y: number;
  /** 0–1 relative density, drives glow size and opacity only. */
  intensity: number;
};

export type HeatmapData = {
  points: HeatPoint[];
  countries: number;
  /** True when no real member geography has been imported yet. */
  awaitingImport: boolean;
};

/**
 * Member geography for the public map.
 *
 * Read only from `MemberGeoPoint`, which is populated by importing the real
 * Mighty Networks membership export (`scripts/import-member-geo.ts`). Local
 * test accounts are deliberately not a source: the map has to read as "people
 * all over the world are already doing this", and a handful of seeded pins
 * clustered in one spot would be a lie.
 *
 * No names, no exact locations — city or region level at the finest — and no
 * counts are ever returned for display.
 */
export async function getCommunityHeatmap(): Promise<HeatmapData> {
  if (!process.env.DATABASE_URL) {
    return { points: [], countries: 0, awaitingImport: true };
  }

  try {
    const rows = await prisma.memberGeoPoint.findMany({
      select: { latitude: true, longitude: true, weight: true, country: true },
    });
    if (rows.length === 0) {
      return { points: [], countries: 0, awaitingImport: true };
    }

    const maxWeight = Math.max(...rows.map((row) => row.weight));
    return {
      points: rows.map((row) => ({
        x: ((row.longitude + 180) / 360) * 100,
        y: ((90 - row.latitude) / 180) * 100,
        intensity: maxWeight > 0 ? row.weight / maxWeight : 0,
      })),
      countries: new Set(rows.map((row) => row.country)).size,
      awaitingImport: false,
    };
  } catch {
    return { points: [], countries: 0, awaitingImport: true };
  }
}
