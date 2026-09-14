/**
 * Imports real member geography for the public community heatmap.
 *
 *   pnpm tsx scripts/import-member-geo.ts <export.csv>
 *
 * Expects a CSV exported from Mighty Networks with a header row. Recognised
 * column names (case-insensitive, first match wins):
 *
 *   country            country, country_name
 *   region             region, state, province
 *   city               city, town, locality
 *   latitude           latitude, lat
 *   longitude          longitude, lng, lon, long
 *
 * Rows are aggregated to country/region/city before writing, so no individual
 * member is stored and no name ever lands in the database. Rows without usable
 * coordinates are skipped and reported.
 *
 * Re-running replaces the previous import for the same source.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseCsv, pickColumn, toNumberCell, type CsvRow } from "../lib/csv";

const prisma = new PrismaClient();

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: pnpm tsx scripts/import-member-geo.ts <export.csv>");
    process.exit(1);
  }

  const rows: CsvRow[] = parseCsv(readFileSync(file, "utf8"));
  if (rows.length === 0) {
    console.error("No data rows found in that file.");
    process.exit(1);
  }

  const buckets = new Map<
    string,
    {
      country: string;
      region: string | null;
      city: string | null;
      latitude: number;
      longitude: number;
      weight: number;
    }
  >();
  let skipped = 0;

  for (const row of rows) {
    const country = pickColumn(row, ["country", "country_name"]);
    const region = pickColumn(row, ["region", "state", "province"]) || null;
    const city = pickColumn(row, ["city", "town", "locality"]) || null;
    const latitude = toNumberCell(pickColumn(row, ["latitude", "lat"]));
    const longitude = toNumberCell(
      pickColumn(row, ["longitude", "lng", "lon", "long"]),
    );

    if (
      !country ||
      latitude === null ||
      longitude === null ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      skipped += 1;
      continue;
    }

    const key = `${country}|${region ?? ""}|${city ?? ""}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.weight += 1;
    } else {
      buckets.set(key, { country, region, city, latitude, longitude, weight: 1 });
    }
  }

  if (buckets.size === 0) {
    console.error(
      `No usable rows: all ${rows.length} were missing a country or valid coordinates.`,
    );
    process.exit(1);
  }

  await prisma.memberGeoPoint.deleteMany({ where: { source: "mighty" } });
  for (const bucket of buckets.values()) {
    await prisma.memberGeoPoint.create({
      data: { source: "mighty", ...bucket },
    });
  }

  const countries = new Set([...buckets.values()].map((b) => b.country)).size;
  console.log(
    `Imported ${buckets.size} location buckets across ${countries} countries from ${rows.length} rows.`,
  );
  if (skipped > 0) {
    console.log(`Skipped ${skipped} rows without a country or valid coordinates.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
