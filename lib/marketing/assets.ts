/**
 * Every image and video slot on the two sales pages.
 *
 * Photography rule from the client brief: no stock photography and no AI
 * images, anywhere. Replacements come from Adam's WordPress media library on
 * cinnamonsnail.com — which is what the `cinnamonsnail.com/wp-content/uploads`
 * URLs below are. Where a slot still has no real photo, it renders a branded
 * flagged panel and appears in this manifest — never a stock placeholder.
 *
 * To fill or swap a slot: change `src`. That is the only edit needed; the
 * pages pick it up automatically.
 *
 * NOTE ON HOSTING: the cinnamonsnail.com photos are hotlinked from Adam's live
 * WordPress site. That is correct per the brief (it is his own media library),
 * but for production these should be copied into Vercel Blob alongside the
 * videos so the sales pages do not depend on his WP host staying up or fast.
 */
export type AssetSlot = {
  id: string;
  page: "homepage" | "membership";
  section: string;
  need: string;
  src: string | null;
  alt: string;
  kind: "image" | "video";
  /** Videos only: native aspect, so players frame them without letterboxing. */
  orientation?: "landscape" | "portrait";
};

const BLOB = "https://yqcfew9eptifgesz.public.blob.vercel-storage.com";
const WP = "https://cinnamonsnail.com/wp-content/uploads";

export const ASSET_SLOTS: AssetSlot[] = [
  {
    id: "home-hero",
    page: "homepage",
    section: "Hero background",
    need:
      "Landscape footage that survives heavy cropping and reads as texture behind the headline.",
    // Adam to camera in his own kitchen, 1920x1080, 107s. Runs muted and
    // looping behind the hero copy.
    src: `${BLOB}/Vegan%20Cooking%20Classes%20-%20Adam%20Sobel%20%281080p%2C%20h264%29.mp4`,
    alt: "",
    kind: "video",
    orientation: "landscape",
  },
  {
    id: "home-learn",
    page: "homepage",
    section: "Learn card",
    need:
      "Ideally Adam mid-class, teaching to camera. This knife-work shot stands in until a true cook-along frame is available.",
    src: `${WP}/2023/03/Parsley-Chop.jpg`,
    alt: "Herbs being chopped on a wooden board",
    kind: "image",
  },
  {
    id: "home-cook",
    page: "homepage",
    section: "Cook card",
    need: "A finished dish from a normal home kitchen.",
    src: `${WP}/2025/08/mushroom_bourguignon-02-720x960.jpg`,
    alt: "A bowl of mushroom bourguignon",
    kind: "image",
  },
  {
    id: "home-belong",
    page: "homepage",
    section: "Belong card",
    need:
      "A community or potluck-style shot — real members around a table. Nothing on cinnamonsnail.com currently shows people eating together; this needs a photo from Adam.",
    src: null,
    alt: "",
    kind: "image",
  },
  {
    id: "home-kitchen-table",
    page: "homepage",
    section: "Kitchen Table is not a feed",
    need:
      "A shared table mid-meal, several plates and hands. The jewelled rice platter below reads as a sharing dish, but a real table photo would land the point better.",
    src: `${WP}/2025/05/Persian_rice-06-720x960.jpg`,
    alt: "A large platter of jewelled Persian rice pilaf",
    kind: "image",
  },
  {
    id: "home-membership-teaser",
    page: "homepage",
    section: "Membership teaser card",
    need:
      "The spread you'd cook for skeptical in-laws — a holiday centrepiece works.",
    src: `${WP}/2024/09/Vegan-Turkey-Roast-01-720x960.jpg`,
    alt: "A stuffed vegan roast on a serving board",
    kind: "image",
  },
  {
    id: "membership-sales-video",
    page: "membership",
    section: "Top of page",
    need:
      'Adam talking straight to camera. Currently the 78s portrait clip from his kitchen; swap `src` to the landscape "Vegan Cooking Classes" file if that is the preferred sales cut.',
    src: `${BLOB}/Video-11882.mp4`,
    alt: "",
    kind: "video",
    orientation: "portrait",
  },
];

export function assetSlot(id: string): AssetSlot {
  const slot = ASSET_SLOTS.find((item) => item.id === id);
  if (!slot) throw new Error(`Unknown asset slot: ${id}`);
  return slot;
}

export function pendingAssets(page?: AssetSlot["page"]): AssetSlot[] {
  return ASSET_SLOTS.filter(
    (slot) => slot.src === null && (page ? slot.page === page : true),
  );
}

/**
 * "Featured in" credits. Every one of these is verifiable from Adam's own
 * about page — no invented placements.
 */
export const PRESS_CREDITS = [
  "New York Times",
  "Food Network",
  "PBS",
  "VegNews",
  "James Beard House",
  "Vendy Cup winner",
  "Street Vegan · Clarkson Potter",
] as const;
