/**
 * Applies the client's class spreadsheet (dish photos + teaser videos) to the
 * course catalog.
 *
 *   pnpm tsx scripts/import-class-media.ts [sheet.csv] [options]
 *
 * Defaults to data/class-media.csv, which is the current export of the Google
 * Sheet Adam maintains. Re-run it with a fresh export whenever he fills more
 * rows in; it is idempotent.
 *
 * Options:
 *   --dry-run        Report what would change without writing anything.
 *   --photos-only    Only write coverUrl.
 *   --teasers-only   Only write teaserVideoUrl.
 *   --overwrite      Replace covers/teasers that are already set. By default
 *                    an existing real value is left alone (a stock-host value
 *                    is always replaceable, since it can never be shown).
 *   --out <dir>      Where to write the "still missing" reports.
 *                    Default: tmp/class-media.
 *
 * data/class-media-aliases.csv pairs sheet spellings with course slugs for the
 * handful of names the matcher will not pair on its own. Add a row there
 * rather than loosening the matcher.
 *
 * Always writes two reports next to each other:
 *   missing-class-media.csv   one row per class we have no photo/teaser for
 *   unmatched-sheet-rows.csv  sheet rows that did not match a class
 *
 * The first is the one to hand back to the client: it lists only the class
 * names still needing a photo or a teaser, with a column saying which.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { toCsv } from "../lib/csv";
import {
  matchClassMedia,
  parseClassAliases,
  parseClassMediaCsv,
  teaserForStorage,
} from "../lib/marketing/class-media";
import { isStockImageUrl } from "../lib/marketing/stock-hosts";

const prisma = new PrismaClient();

const DEFAULT_SHEET = "data/class-media.csv";
const DEFAULT_ALIASES = "data/class-media-aliases.csv";
const DEFAULT_OUT = join("tmp", "class-media");

type Options = {
  sheet: string;
  dryRun: boolean;
  photosOnly: boolean;
  teasersOnly: boolean;
  overwrite: boolean;
  outDir: string;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    sheet: DEFAULT_SHEET,
    dryRun: false,
    photosOnly: false,
    teasersOnly: false,
    overwrite: false,
    outDir: DEFAULT_OUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--photos-only") options.photosOnly = true;
    else if (arg === "--teasers-only") options.teasersOnly = true;
    else if (arg === "--overwrite") options.overwrite = true;
    else if (arg === "--out") {
      index += 1;
      options.outDir = argv[index] ?? DEFAULT_OUT;
    } else if (!arg.startsWith("--")) options.sheet = arg;
  }
  if (options.photosOnly && options.teasersOnly) {
    console.error("--photos-only and --teasers-only are mutually exclusive.");
    process.exit(1);
  }
  return options;
}

/**
 * Whether a stored value counts as "already filled".
 *
 * A stock-host cover does not: the public catalog filters those out at render
 * time, so leaving one in place would keep the card reading "dish photo
 * needed" while the import claimed it was done.
 */
function isFilled(value: string | null): boolean {
  if (!value) return false;
  return !isStockImageUrl(value);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  let sheetText: string;
  try {
    sheetText = readFileSync(options.sheet, "utf8");
  } catch {
    console.error(`Could not read ${options.sheet}`);
    process.exit(1);
  }

  const rows = parseClassMediaCsv(sheetText);
  if (rows.length === 0) {
    console.error(
      `No usable rows in ${options.sheet}. Expected a header with a class name column.`,
    );
    process.exit(1);
  }

  // Optional: absent simply means no manual pairings have been recorded.
  let aliases = new Map<string, string>();
  try {
    aliases = parseClassAliases(readFileSync(DEFAULT_ALIASES, "utf8"));
  } catch {
    // No alias file is a normal state, not an error.
  }

  const courses = await prisma.course.findMany({
    select: {
      slug: true,
      title: true,
      coverUrl: true,
      teaserVideoUrl: true,
    },
    orderBy: { title: "asc" },
  });

  if (courses.length === 0) {
    console.error("No courses in the database — nothing to match against.");
    process.exit(1);
  }

  const report = matchClassMedia(rows, courses, aliases);
  const bySlug = new Map(courses.map((course) => [course.slug, course]));

  let photosWritten = 0;
  let teasersWritten = 0;
  let photosSkipped = 0;
  let teasersSkipped = 0;

  for (const match of report.matched) {
    const course = bySlug.get(match.course.slug);
    if (!course) continue;

    const data: { coverUrl?: string; teaserVideoUrl?: string } = {};

    if (!options.teasersOnly && match.row.thumbnailUrl) {
      if (options.overwrite || !isFilled(course.coverUrl)) {
        if (course.coverUrl !== match.row.thumbnailUrl) {
          data.coverUrl = match.row.thumbnailUrl;
        }
      } else {
        photosSkipped += 1;
      }
    }

    if (!options.photosOnly) {
      const teaser = teaserForStorage(match.row);
      if (teaser) {
        if (options.overwrite || !isFilled(course.teaserVideoUrl)) {
          if (course.teaserVideoUrl !== teaser) data.teaserVideoUrl = teaser;
        } else {
          teasersSkipped += 1;
        }
      }
    }

    if (Object.keys(data).length === 0) continue;

    if (data.coverUrl) photosWritten += 1;
    if (data.teaserVideoUrl) teasersWritten += 1;

    if (!options.dryRun) {
      await prisma.course.update({ where: { slug: course.slug }, data });
    }
  }

  // --- Reports -------------------------------------------------------
  // Recomputed from what the database will hold after this run, so the
  // "still missing" list is true whether or not anything was written.
  const appliedPhoto = new Map<string, string>();
  const appliedTeaser = new Map<string, string>();
  for (const match of report.matched) {
    if (match.row.thumbnailUrl) {
      appliedPhoto.set(match.course.slug, match.row.thumbnailUrl);
    }
    const teaser = teaserForStorage(match.row);
    if (teaser) appliedTeaser.set(match.course.slug, teaser);
  }

  const missingRows: string[][] = [];
  for (const course of courses) {
    const hasPhoto =
      isFilled(course.coverUrl) || appliedPhoto.has(course.slug);
    const hasTeaser =
      isFilled(course.teaserVideoUrl) || appliedTeaser.has(course.slug);
    if (hasPhoto && hasTeaser) continue;
    const needs =
      !hasPhoto && !hasTeaser
        ? "photo + teaser"
        : !hasPhoto
          ? "photo"
          : "teaser";
    missingRows.push([course.title, needs, course.slug]);
  }

  mkdirSync(options.outDir, { recursive: true });

  const missingPath = join(options.outDir, "missing-class-media.csv");
  writeFileSync(
    missingPath,
    toCsv(["class_name", "still_needs", "slug"], missingRows),
    "utf8",
  );

  const unmatchedPath = join(options.outDir, "unmatched-sheet-rows.csv");
  writeFileSync(
    unmatchedPath,
    toCsv(
      ["sheet_class_name", "closest_course_in_catalog", "similarity"],
      report.unmatchedRows.map((item) => [
        item.row.className,
        item.course.title,
        item.score.toFixed(2),
      ]),
    ),
    "utf8",
  );

  // --- Console summary -----------------------------------------------
  const verb = options.dryRun ? "would write" : "wrote";
  console.log(
    `Sheet: ${rows.length} rows. Catalog: ${courses.length} classes.` +
      (aliases.size ? ` ${aliases.size} manual alias(es) applied.` : ""),
  );
  console.log(
    `Matched ${report.matched.length} rows to classes; ${verb} ${photosWritten} cover photos and ${teasersWritten} teasers.`,
  );
  if (photosSkipped || teasersSkipped) {
    console.log(
      `Left alone ${photosSkipped} covers and ${teasersSkipped} teasers that already had a real value (use --overwrite to replace).`,
    );
  }
  if (report.duplicateRows.length) {
    console.log(
      `\n${report.duplicateRows.length} duplicate class name(s) in the sheet — only the first was used:`,
    );
    for (const row of report.duplicateRows) console.log(`  · ${row.className}`);
  }
  if (report.unmatchedRows.length) {
    console.log(
      `\n${report.unmatchedRows.length} sheet row(s) did not match a class. Closest candidates (NOT applied):`,
    );
    for (const item of report.unmatchedRows) {
      console.log(
        `  · "${item.row.className}"  →  "${item.course.title}" (${item.score.toFixed(2)})`,
      );
    }
  }
  console.log(
    `\n${missingRows.length} class(es) still missing media. Hand back: ${missingPath}`,
  );
  if (report.unmatchedRows.length) {
    console.log(`Unmatched sheet rows: ${unmatchedPath}`);
  }
  if (options.dryRun) console.log("\n(dry run — nothing was written)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
