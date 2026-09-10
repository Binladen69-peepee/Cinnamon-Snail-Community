/**
 * Hosts that serve stock or AI-generated imagery.
 *
 * The client brief forbids stock and AI images anywhere on the sales pages.
 * Course covers come from the database, which is also seeded with demo data for
 * the member-facing app, so the public catalog filters cover URLs through this
 * list rather than trusting whatever is stored. A filtered card falls back to
 * its "dish photo needed" state, which is the honest outcome.
 */
const STOCK_HOSTS = [
  "unsplash.com",
  "images.unsplash.com",
  "pexels.com",
  "images.pexels.com",
  "shutterstock.com",
  "gettyimages.com",
  "istockphoto.com",
  "stock.adobe.com",
  "freepik.com",
  "pixabay.com",
  "placehold.co",
  "placekitten.com",
  "via.placeholder.com",
] as const;

export function isStockImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lowered = url.toLowerCase();
  return STOCK_HOSTS.some(
    (host) => lowered.includes(`//${host}`) || lowered.includes(`.${host}`),
  );
}

/** Returns the url only if it is not stock imagery. */
export function realPhotoOnly(url: string | null | undefined): string | null {
  if (!url) return null;
  return isStockImageUrl(url) ? null : url;
}
