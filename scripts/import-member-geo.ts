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

const prisma = new PrismaClient();

type Row = Record<string, string>;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsv(text: string): Row[] {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function pick(row: Row, candidates: string[]): string {
  for (const candidate of candidates) {
    const value = row[candidate];
    if (value) return value;
  }
  return "";
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: pnpm tsx scripts/import-member-geo.ts <export.csv>");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(file, "utf8"));
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
    const country = pick(row, ["country", "country_name"]);
    const region = pick(row, ["region", "state", "province"]) || null;
    const city = pick(row, ["city", "town", "locality"]) || null;
    const latitude = Number(pick(row, ["latitude", "lat"]));
    const longitude = Number(pick(row, ["longitude", "lng", "lon", "long"]));

    if (
      !country ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
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
