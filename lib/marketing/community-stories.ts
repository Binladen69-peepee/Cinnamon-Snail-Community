/**
 * Polaroid cards around the community globe.
 *
 * Photos and titles come from the spreadsheet class library. Places come from
 * the globe markers (city or region only). Nothing here invents a class, a
 * stock face, or a city the map does not already have.
 */

import {
  CLASS_LIBRARY,
  resolveClassPhoto,
  type LibraryClass,
} from "@/lib/marketing/class-library";
import type { GlobeMarker } from "@/lib/marketing/globe-markers";

const POSTCARD_TITLES = [
  "The Green Reaper: Vegan Salad Bible",
  "The Perfect Vegan Brunch Cooking Class",
  "Make the Best Plant-Based Pizza",
  "Vegan Indonesian BBQ",
] as const;

export type CommunityPostcard = {
  title: string;
  photo: string;
  place: string;
};

export function communityPostcards(
  markers: GlobeMarker[],
  classes: LibraryClass[] = CLASS_LIBRARY,
): CommunityPostcard[] {
  const spread = pickSpread(markers, POSTCARD_TITLES.length);
  const cards: CommunityPostcard[] = [];

  for (let i = 0; i < POSTCARD_TITLES.length; i += 1) {
    const cls = classes.find((row) => row.title === POSTCARD_TITLES[i]);
    const photo = resolveClassPhoto(cls?.thumbnailUrl);
    const place = spread[i]?.place;
    if (!cls || !photo || !place) continue;
    cards.push({ title: cls.title, photo, place });
  }

  return cards;
}

/** Four markers from different parts of the map, not the first four in a cluster. */
function pickSpread(markers: GlobeMarker[], count: number): GlobeMarker[] {
  if (markers.length <= count) return markers;
  const step = Math.floor(markers.length / count);
  return Array.from({ length: count }, (_, index) => markers[index * step]!);
}
