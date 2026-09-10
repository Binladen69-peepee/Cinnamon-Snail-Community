import { describe, expect, it } from "vitest";
import { getGlobeMarkers } from "@/lib/marketing/globe-markers";

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
