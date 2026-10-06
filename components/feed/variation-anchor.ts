/**
 * Links to one recipe variation.
 *
 * A variation row renders with `id="variation-<id>"`, and a profile's activity
 * links to `/posts/<recipePostId>#variation-<id>` (`variationHref` in
 * `lib/social/activity.ts`). The list on the post page scrolls to the row and
 * highlights it, the way comment anchors do (C4). Pure, so both halves of the
 * link are tested against each other.
 */

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const PREFIX = "variation-";

/** The element id a variation row renders with. */
export function variationAnchorId(variationId: string): string {
  return `${PREFIX}${variationId}`;
}

/** The variation id a URL fragment points at, or null. */
export function variationIdFromHash(hash: string | null | undefined): string | null {
  if (!hash) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw.startsWith(PREFIX)) return null;
  let id = raw.slice(PREFIX.length);
  try {
    id = decodeURIComponent(id);
  } catch {
    return null;
  }
  return ID.test(id) ? id : null;
}
