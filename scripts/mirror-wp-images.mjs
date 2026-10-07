// Copies the client's WordPress photos the site uses into public/media/wp
// (DEC-087), so pages never depend on his WordPress host or its CDN to show
// them.
//
//   node scripts/mirror-wp-images.mjs          # fetch what is missing
//   node scripts/mirror-wp-images.mjs --force  # fetch everything again
//
// Every upload URL in the files below is fetched once through WordPress's
// image CDN (i0.wp.com — cinnamonsnail.com itself refuses anything that is not
// a browser on its own pages), resized, as WebP, with camera metadata
// stripped, and the list of mirrored paths is written to
// lib/media/wp-mirror.json, which `servableImageUrl` reads. Run it after
// adding a photo to the class sheet or the sales pages, and commit the result.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SOURCES = [
  "data/class-library.json",
  "lib/marketing/assets.ts",
  "prisma/seed-catalog.ts",
  "prisma/seed-feed-demo.ts",
];
const UPLOADS = "https://cinnamonsnail.com/wp-content/uploads/";
const CDN = "https://i0.wp.com/cinnamonsnail.com/wp-content/uploads/";
const OUT = "public/media/wp";
const MANIFEST = "lib/media/wp-mirror.json";

/** Full-bleed photos, mirrored wider than a content photo. */
const WIDE = new Set(["2025/02/matcha-donuts-11.jpg"]);
const WIDTH = 1600;
const WIDE_WIDTH = 2000;
/** The second, smaller copy, for tiles, cards and thumbnails. */
const SMALL_WIDTH = 800;

const force = process.argv.includes("--force");
const pattern = /https?:\/\/(?:www\.)?cinnamonsnail\.com\/wp-content\/uploads\/([^"'`\s)?#]+)/g;

const paths = new Set();
for (const file of SOURCES) {
  const text = readFileSync(file, "utf8").replaceAll("${WP}/", UPLOADS);
  for (const match of text.matchAll(pattern)) paths.add(match[1]);
}

/** Where a photo's copy lives under OUT; `small` is the 800px one. */
export function mirroredPath(rel, small = false) {
  return rel.replace(/\.[a-z0-9]+$/i, small ? "-800.webp" : ".webp");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isWebp = (bytes) =>
  bytes.length > 12 &&
  bytes.toString("ascii", 0, 4) === "RIFF" &&
  bytes.toString("ascii", 8, 12) === "WEBP";

/** One copy, retried; true once it is on disk. */
async function fetchCopy(rel, width, out) {
  const url = `${CDN}${rel}?w=${width}&quality=78&strip=info`;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: "image/webp" }, signal: AbortSignal.timeout(30_000) });
      const body = Buffer.from(await response.arrayBuffer());
      if (response.ok && isWebp(body)) {
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, body);
        bytes += body.length;
        return true;
      }
      console.warn(`  ${rel} @${width}: ${response.status} ${response.headers.get("content-type")} (attempt ${attempt})`);
    } catch (error) {
      console.warn(`  ${rel} @${width}: ${error instanceof Error ? error.message : error} (attempt ${attempt})`);
    }
    await sleep(1500 * attempt);
  }
  return false;
}

const mirrored = [];
const failed = [];
let fetched = 0;
let bytes = 0;
for (const rel of [...paths].sort()) {
  const copies = [
    [WIDE.has(rel) ? WIDE_WIDTH : WIDTH, join(OUT, mirroredPath(rel))],
    [SMALL_WIDTH, join(OUT, mirroredPath(rel, true))],
  ];
  let ok = true;
  for (const [width, out] of copies) {
    if (existsSync(out) && !force) continue;
    if (await fetchCopy(rel, width, out)) fetched += 1;
    else ok = false;
    // One at a time, and gently: the CDN drops bursts.
    await sleep(250);
  }
  if (ok) mirrored.push(rel);
  else failed.push(rel);
}

writeFileSync(MANIFEST, `${JSON.stringify(mirrored.sort(), null, 2)}\n`);
console.log(
  `${paths.size} photos referenced; ${fetched} fetched (${(bytes / 1048576).toFixed(1)} MB), ${mirrored.length} mirrored, ${failed.length} failed`,
);
if (failed.length) {
  for (const rel of failed) console.log(`  failed: ${rel}`);
  process.exitCode = 1;
}
