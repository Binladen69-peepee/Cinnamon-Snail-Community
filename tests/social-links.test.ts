import { describe, expect, it } from "vitest";
import { SOCIAL_LINKS } from "@/lib/marketing/social";

describe("social links", () => {
  it("covers all five destinations", () => {
    expect(SOCIAL_LINKS.map((l) => l.name)).toEqual([
      "Instagram",
      "Pinterest",
      "Facebook",
      "YouTube",
      "Website",
    ]);
  });

  it("points at the real Cinnamon Snail profiles", () => {
    const byName = Object.fromEntries(SOCIAL_LINKS.map((l) => [l.name, l.href]));
    expect(byName.Instagram).toBe("https://www.instagram.com/cinnamonsnail/");
    expect(byName.Pinterest).toBe("https://www.pinterest.com/cinnamonsnail/");
    expect(byName.Facebook).toBe("https://www.facebook.com/TheCinnamonSnail/");
    expect(byName.YouTube).toBe("https://www.youtube.com/@CinnamonSnail");
    expect(byName.Website).toBe("https://cinnamonsnail.com/");
  });

  it("uses https everywhere", () => {
    for (const link of SOCIAL_LINKS) {
      expect(link.href.startsWith("https://")).toBe(true);
    }
  });

  it("gives every link a distinct icon and an accessible label", () => {
    const icons = SOCIAL_LINKS.map((l) => l.icon);
    expect(new Set(icons).size).toBe(icons.length);
    for (const link of SOCIAL_LINKS) {
      // The glyph is aria-hidden, so the label is the only thing announced.
      expect(link.label.length).toBeGreaterThan(3);
    }
  });

  it("has no duplicate hrefs", () => {
    const hrefs = SOCIAL_LINKS.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
