import { describe, expect, it } from "vitest";
import { getGlobeMarkers } from "@/lib/marketing/globe-markers";
import { LAND_RINGS } from "@/lib/marketing/land-rings";

describe("community globe data", () => {
  it("falls back to labelled stand-ins with no database configured", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const data = await getGlobeMarkers(8);
      expect(data.placeholder).toBe(true);
      expect(data.markers).toHaveLength(8);
      // Every stand-in must say so, so the UI can never pass them off as real.
      expect(data.markers.every((marker) => marker.placeholder)).toBe(true);
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });

  it("reports no country count while showing stand-ins", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect((await getGlobeMarkers(4)).countries).toBe(0);
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });

  it("respects the marker limit", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect((await getGlobeMarkers(3)).markers).toHaveLength(3);
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });

  it("spreads stand-ins across hemispheres, not one cluster", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const { markers } = await getGlobeMarkers(8);
      expect(markers.some((m) => m.lng < -30)).toBe(true); // Americas
      expect(markers.some((m) => m.lng > 60)).toBe(true); // Asia-Pacific
      expect(markers.some((m) => m.lat < 0)).toBe(true); // southern
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });

  it("gives every marker a photo and a place label for its pin", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      for (const marker of (await getGlobeMarkers(8)).markers) {
        expect(marker.avatarUrl.startsWith("https://")).toBe(true);
        expect(marker.place.length).toBeGreaterThan(1);
        expect(marker.weight).toBeGreaterThan(0);
        expect(Math.abs(marker.lat)).toBeLessThanOrEqual(90);
        expect(Math.abs(marker.lng)).toBeLessThanOrEqual(180);
      }
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });
});

describe("globe land geometry", () => {
  it("is present and small enough to ship to the browser", () => {
    expect(LAND_RINGS.length).toBeGreaterThan(10);
    const points = LAND_RINGS.reduce((n, ring) => n + ring.length / 2, 0);
    expect(points).toBeGreaterThan(400);
    // The whole point of simplifying was to keep this tiny. If a regenerated
    // file blows past this, the globe is shipping a map instead of a sketch.
    expect(points).toBeLessThan(4000);
  });

  it("stores flat lon/lat pairs, so every ring has an even length", () => {
    for (const ring of LAND_RINGS) {
      expect(ring.length % 2).toBe(0);
      // Fewer than three points cannot enclose anything.
      expect(ring.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("keeps every coordinate on the planet", () => {
    for (const ring of LAND_RINGS) {
      for (let i = 0; i < ring.length; i += 2) {
        expect(Math.abs(ring[i])).toBeLessThanOrEqual(180);
        expect(Math.abs(ring[i + 1])).toBeLessThanOrEqual(90);
      }
    }
  });

  it("is ordered largest ring first, so the big landmasses draw first", () => {
    const lengths = LAND_RINGS.map((ring) => ring.length);
    expect([...lengths].sort((a, b) => b - a)).toEqual(lengths);
  });
});
