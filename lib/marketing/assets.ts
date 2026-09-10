/**
 * Every image and video slot on the two sales pages.
 *
 * Photography rule from the client brief: no stock photography and no AI
 * images, anywhere. Replacements come from Adam's WordPress media library on
 * cinnamonsnail.com. Where a slot has no real photo yet, it renders a branded
 * flagged panel and appears in this manifest — never a stock placeholder.
 *
 * To fill a slot: put the real asset URL in `src`. That is the only edit
 * needed; the page picks it up automatically.
 */
export type AssetSlot = {
  id: string;
  page: "homepage" | "membership";
  section: string;
  need: string;
  src: string | null;
  alt: string;
  kind: "image" | "video";
};

export const ASSET_SLOTS: AssetSlot[] = [
  {
    id: "home-hero",
    page: "homepage",
    section: "Hero",
    need:
      "Hero photo or short clip — Adam cooking, or a finished dish shot. Recipe-post hero images are the best-looking shot of any given dish.",
    src: null,
    alt: "",
    kind: "image",
  },
  {
    id: "home-learn",
    page: "homepage",
    section: "Learn card",
    need: "A live cook-along photo — Adam teaching to camera, or a class in progress.",
    src: null,
    alt: "",
    kind: "image",
  },
  {
    id: "home-cook",
    page: "homepage",
    section: "Cook card",
    need: "A member's plate or a dish mid-cook in a normal home kitchen.",
    src: null,
    alt: "",
    kind: "image",
  },
  {
    id: "home-belong",
    page: "homepage",
    section: "Belong card",
    need: "A community or potluck-style shot — real people around a table.",
    src: null,
    alt: "",
    kind: "image",
  },
  {
    id: "home-kitchen-table",
    page: "homepage",
    section: "Kitchen Table is not a feed",
    need: "A shared table of plated food, or members eating together.",
    src: null,
    alt: "",
    kind: "image",
  },
  {
    id: "home-membership-teaser",
    page: "homepage",
    section: "Membership teaser card",
    need:
      "A dinner-party spread — ideally the kind of menu you'd cook for skeptical in-laws.",
    src: null,
    alt: "",
    kind: "image",
  },
  {
    id: "membership-sales-video",
    page: "membership",
    section: "Top of page",
    need:
      'Adam\'s existing sales video, "Vegan University Sale2" — needs a hosted URL or embed code.',
    src: null,
    alt: "",
    kind: "video",
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
