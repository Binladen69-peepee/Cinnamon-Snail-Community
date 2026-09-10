import { describe, expect, it } from "vitest";
import {
  CANCEL_REASSURANCE,
  CHECKOUT_LABEL,
  CHECKOUT_URL,
  PRICING,
  SAMCART_SLIDE_SCRIPT,
} from "@/lib/marketing/checkout";
import {
  ASSET_SLOTS,
  PRESS_CREDITS,
  REEL_KICKER,
  REEL_QUOTE,
  REEL_SUPPORT,
  REEL_TRANSCRIPT,
  assetSlot,
  pendingAssets,
} from "@/lib/marketing/assets";
import { isStockImageUrl, realPhotoOnly } from "@/lib/marketing/stock-hosts";
import {
  HOMEPAGE_FAQS,
  HOMEPAGE_HERO,
  MEMBERSHIP_PAGE,
  PILLAR_CARDS,
} from "@/lib/marketing/copy";

describe("the single call to action", () => {
  it("points at the SamCart checkout with the slide-open fragment", () => {
    expect(CHECKOUT_URL).toBe(
      "https://cinnamonsnail.mysamcart.com/checkout/monthly-subscription#samcart-slide-open-right",
    );
  });

  it("uses the one approved label", () => {
    expect(CHECKOUT_LABEL).toBe("Become a member");
  });

  it("keeps the slide script that the fragment depends on", () => {
    expect(SAMCART_SLIDE_SCRIPT).toBe(
      "https://static.samcart.com/checkouts/sc-slide-script.js",
    );
  });

  it("states the prices the page must show without starting checkout", () => {
    expect(PRICING.monthly).toBe("$59/month");
    expect(PRICING.yearly).toBe("$599");
  });

  it("promises no hoops on cancellation", () => {
    expect(CANCEL_REASSURANCE.toLowerCase()).toContain("cancel whenever you want");
  });
});

describe("copy guardrails", () => {
  const allCopy = [
    HOMEPAGE_HERO.headline,
    HOMEPAGE_HERO.subhead,
    ...PILLAR_CARDS.map((card) => card.body),
    ...HOMEPAGE_FAQS.flatMap((faq) => [faq.question, ...faq.answer]),
    MEMBERSHIP_PAGE.headline,
    MEMBERSHIP_PAGE.subhead,
    ...MEMBERSHIP_PAGE.opening,
    ...MEMBERSHIP_PAGE.inside.flatMap((item) => [item.title, item.body]),
    ...MEMBERSHIP_PAGE.close.paragraphs,
    MEMBERSHIP_PAGE.close.afterCta,
  ].join(" ");

  it("carries no member counts anywhere", () => {
    // "Join 5 plant lovers", "12,000 members", etc. are all disallowed.
    expect(allCopy).not.toMatch(/\b[\d,]+\s*(\+\s*)?(members|plant lovers|cooks joined)\b/i);
    expect(allCopy.toLowerCase()).not.toContain("join 5");
  });

  it("invents no urgency", () => {
    for (const phrase of ["spots left", "countdown", "only today", "hurry", "limited time"]) {
      expect(allCopy.toLowerCase()).not.toContain(phrase);
    }
  });

  it("offers no competing call to action", () => {
    for (const phrase of ["peek at the community", "see the catalog", "newsletter", "subscribe to our"]) {
      expect(allCopy.toLowerCase()).not.toContain(phrase);
    }
  });

  it("keeps the hero promise about winning over skeptics", () => {
    expect(HOMEPAGE_HERO.headline).toContain("second-helping regulars");
  });

  it("keeps all three pillars with a photo slot each", () => {
    expect(PILLAR_CARDS.map((card) => card.title)).toEqual([
      "Learn",
      "Cook",
      "Belong",
    ]);
    for (const card of PILLAR_CARDS) {
      expect(() => assetSlot(card.slotId)).not.toThrow();
    }
  });

  it("answers all four client FAQs", () => {
    expect(HOMEPAGE_FAQS).toHaveLength(4);
    for (const faq of HOMEPAGE_FAQS) {
      expect(faq.answer.length).toBeGreaterThan(0);
      expect(faq.answer.join("").length).toBeGreaterThan(20);
    }
  });

  it("lists only true, specific credibility claims", () => {
    expect(MEMBERSHIP_PAGE.credibility).toContain("James Beard House");
    expect(MEMBERSHIP_PAGE.credibility).toContain("1000+ recipe testers");
  });
});

describe("photography manifest", () => {
  it("never points a slot at a stock or AI image host", () => {
    for (const slot of ASSET_SLOTS) {
      if (!slot.src) continue;
      for (const host of ["unsplash.com", "pexels.com", "shutterstock", "gettyimages"]) {
        expect(slot.src).not.toContain(host);
      }
    }
  });

  it("gives every unfilled slot an actionable description for Adam", () => {
    for (const slot of pendingAssets()) {
      expect(slot.need.length).toBeGreaterThan(20);
      expect(slot.section.length).toBeGreaterThan(0);
    }
  });

  it("uses unique slot ids", () => {
    const ids = ASSET_SLOTS.map((slot) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("throws loudly on an unknown slot rather than rendering nothing", () => {
    expect(() => assetSlot("does-not-exist")).toThrow();
  });
});

describe("stock imagery guard", () => {
  it("rejects the stock hosts the brief rules out", () => {
    for (const url of [
      "https://images.unsplash.com/photo-1512621776951?w=900",
      "https://www.pexels.com/photo/food-123/",
      "https://images.shutterstock.com/x.jpg",
      "https://media.gettyimages.com/x.jpg",
      "https://cdn.pixabay.com/photo/x.jpg",
      "https://via.placeholder.com/600",
    ]) {
      expect(isStockImageUrl(url)).toBe(true);
      expect(realPhotoOnly(url)).toBeNull();
    }
  });

  it("passes through a real media-library photo untouched", () => {
    const real = "https://cinnamonsnail.com/wp-content/uploads/2024/05/tortas.jpg";
    expect(isStockImageUrl(real)).toBe(false);
    expect(realPhotoOnly(real)).toBe(real);
  });

  it("treats a missing url as simply absent, not as stock", () => {
    expect(isStockImageUrl(null)).toBe(false);
    expect(realPhotoOnly(null)).toBeNull();
    expect(realPhotoOnly(undefined)).toBeNull();
  });

  it("is not fooled by a stock host appearing as a subdomain", () => {
    expect(isStockImageUrl("https://cdn.unsplash.com/x.jpg")).toBe(true);
  });
});

describe("video slots", () => {
  it("uses a landscape clip for the hero, since it is cropped to a wide band", () => {
    const hero = assetSlot("home-hero");
    expect(hero.kind).toBe("video");
    expect(hero.orientation).toBe("landscape");
    expect(hero.src).toBeTruthy();
  });

  it("declares an orientation for every video so players can frame it", () => {
    for (const slot of ASSET_SLOTS.filter((s) => s.kind === "video")) {
      expect(slot.orientation).toBeDefined();
    }
  });

  it("serves both videos from blob storage, not a third-party embed", () => {
    for (const slot of ASSET_SLOTS.filter((s) => s.kind === "video" && s.src)) {
      expect(slot.src).toContain("blob.vercel-storage.com");
    }
  });

  it("keeps the hero decorative — no alt text on background video", () => {
    expect(assetSlot("home-hero").alt).toBe("");
  });
});

describe("press credits", () => {
  it("lists only placements verifiable from Adam's own about page", () => {
    expect(PRESS_CREDITS).toContain("New York Times");
    expect(PRESS_CREDITS).toContain("Food Network");
    expect(PRESS_CREDITS).toContain("James Beard House");
  });

  it("states no follower, student, or member counts", () => {
    const joined = PRESS_CREDITS.join(" ");
    expect(joined).not.toMatch(/\d[\d,]*\s*\+?\s*(members|students|followers)/i);
  });
});

describe("real photography", () => {
  it("sources filled photo slots from Adam's own media library", () => {
    for (const slot of ASSET_SLOTS.filter((s) => s.kind === "image" && s.src)) {
      expect(slot.src).toContain("cinnamonsnail.com/wp-content/uploads");
    }
  });

  it("gives every filled photo real alt text", () => {
    for (const slot of ASSET_SLOTS.filter((s) => s.kind === "image" && s.src)) {
      expect(slot.alt.length).toBeGreaterThan(3);
    }
  });

  it("still flags the community shot, which has no match on his site", () => {
    expect(assetSlot("home-belong").src).toBeNull();
  });
});

describe("the reel", () => {
  it("uses the portrait clip, presented as a reel rather than cropped", () => {
    const reel = assetSlot("home-reel");
    expect(reel.kind).toBe("video");
    expect(reel.orientation).toBe("portrait");
    expect(reel.src).toContain("Video-11882");
  });

  it("puts the landscape sales cut at the top of /membership", () => {
    const sales = assetSlot("membership-sales-video");
    expect(sales.orientation).toBe("landscape");
    expect(sales.src).toContain("Vegan%20Cooking%20Classes");
  });

  it("quotes Adam verbatim and keeps the pull-quote short", () => {
    expect(REEL_TRANSCRIPT).toContain(REEL_QUOTE);
    expect(REEL_QUOTE.length).toBeLessThan(120);
  });

  it("keeps the full transcript available but off the main flow", () => {
    // The long version is disclosure-only; the page shows the short quote.
    expect(REEL_TRANSCRIPT.length).toBeGreaterThan(400);
    expect(REEL_SUPPORT.length).toBeLessThan(240);
  });

  it("does not sneak a member count into the reel copy", () => {
    const copy = `${REEL_QUOTE} ${REEL_SUPPORT} ${REEL_KICKER}`;
    expect(copy).not.toMatch(/\d[\d,]*\s*\+?\s*(members|students|cooks)\b/i);
  });
});
