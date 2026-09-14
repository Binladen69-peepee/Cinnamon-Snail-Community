/**
 * Regenerates lib/marketing/land-rings.ts, the coastlines the globe draws.
 *
 *   curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson -o land.geojson
 *   node scripts/build-land-rings.mjs land.geojson lib/marketing/land-rings.ts
 *
 * Source is Natural Earth 1:110m land, which is public domain. Run this only
 * to change the level of detail — the output is committed, so a normal build
 * never needs it.
 */
// Turns Natural Earth 110m land into a compact module for the globe.
// Public domain data (naturalearthdata.com).
import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.argv[2];
const OUT = process.argv[3];

const gj = JSON.parse(readFileSync(SRC, "utf8"));

/** Ring area in square degrees — a cheap proxy for "is this worth drawing". */
function area(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

/** Ramer-Douglas-Peucker, in lon/lat degrees. */
function simplify(ring, tol) {
  if (ring.length < 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let far = -1, maxd = 0;
    const [x1, y1] = ring[lo], [x2, y2] = ring[hi];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    for (let i = lo + 1; i < hi; i++) {
      const [px, py] = ring[i];
      let d;
      if (len2 === 0) d = Math.hypot(px - x1, py - y1);
      else {
        let t = ((px - x1) * dx + (py - y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        d = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      }
      if (d > maxd) { maxd = d; far = i; }
    }
    if (maxd > tol && far > 0) {
      keep[far] = 1;
      stack.push([lo, far], [far, hi]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

const rings = [];
for (const feature of gj.features) {
  const g = feature.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const poly of polys) {
    // Outer ring only: holes (lakes) are invisible at this scale and would
    // double the payload.
    const outer = poly[0];
    if (area(outer) < 12) continue; // drop specks
    const simplified = simplify(outer, 0.7);
    if (simplified.length < 4) continue;
    rings.push(simplified);
  }
}

// Flatten to [lon,lat,lon,lat,...] with one decimal. At globe scale one
// decimal is about 11km, which is far finer than a pixel.
const flat = rings.map((r) => r.flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));
flat.sort((a, b) => b.length - a.length);

const points = flat.reduce((n, r) => n + r.length / 2, 0);

const body = `/**
 * World coastlines, as flat [lon, lat, lon, lat, ...] rings.
 *
 * Natural Earth 1:110m land (public domain), simplified with
 * Ramer-Douglas-Peucker at 0.7 degrees and rounded to one decimal. Lakes and
 * specks under 12 square degrees are dropped: neither survives being drawn at
 * a few hundred pixels, and both cost payload.
 *
 * Generated, not hand-edited. ${rings.length} rings, ${points} points.
 */
export const LAND_RINGS: readonly (readonly number[])[] = [
${flat.map((r) => "  [" + r.join(",") + "],").join("\n")}
];
`;

writeFileSync(OUT, body, "utf8");
console.log(`rings: ${rings.length}, points: ${points}, bytes: ${body.length}`);
