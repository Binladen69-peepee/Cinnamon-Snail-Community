import { prisma } from "@/lib/db";

export type GlobeMarker = {
  /** Degrees. */
  lat: number;
  lng: number;
  /** 0–1, drives the marker glow size. */
  weight: number;
  /** Small avatar shown on the pin. */
  avatarUrl: string;
  /** Announced in the marker list; never a member's name or exact location. */
  place: string;
  /** True when this is a stand-in, not imported membership geography. */
  placeholder: boolean;
};

/**
 * Stand-in markers used until the Mighty Networks export lands.
 *
 * Deliberately spread across continents so the globe reads the way the real
 * data will, and deliberately labelled `placeholder: true` so the UI can say so
 * rather than passing them off as members. Avatars are Adam's own crew photo —
 * no stock faces, per the photography rule.
 */
const PLACEHOLDER_AVATAR =
  "https://embed.filekitcdn.com/e/2nBNkb8XH531YbB1QKAjjH/fRktQtbsP7LNGJeudVXnVK";

const PLACEHOLDER_MARKERS: Omit<GlobeMarker, "placeholder">[] = [
  { lat: 40.7128, lng: -74.006, weight: 1, avatarUrl: PLACEHOLDER_AVATAR, place: "New York" },
  { lat: 34.0522, lng: -118.2437, weight: 0.8, avatarUrl: PLACEHOLDER_AVATAR, place: "Los Angeles" },
  { lat: 51.5072, lng: -0.1276, weight: 0.85, avatarUrl: PLACEHOLDER_AVATAR, place: "London" },
  { lat: 48.8566, lng: 2.3522, weight: 0.6, avatarUrl: PLACEHOLDER_AVATAR, place: "Paris" },
  { lat: 19.076, lng: 72.8777, weight: 0.7, avatarUrl: PLACEHOLDER_AVATAR, place: "Mumbai" },
  { lat: -33.8688, lng: 151.2093, weight: 0.65, avatarUrl: PLACEHOLDER_AVATAR, place: "Sydney" },
  { lat: 35.6762, lng: 139.6503, weight: 0.6, avatarUrl: PLACEHOLDER_AVATAR, place: "Tokyo" },
  { lat: -23.5558, lng: -46.6396, weight: 0.55, avatarUrl: PLACEHOLDER_AVATAR, place: "São Paulo" },
];

export type GlobeData = {
  markers: GlobeMarker[];
  /** True when showing stand-ins because no geography has been imported. */
  placeholder: boolean;
};

/**
 * Markers for the hero globe.
 *
 * Reads the same `MemberGeoPoint` table the community heatmap uses — the globe
 * is that feature's hero-section presentation, not a second, disconnected one.
 * When the Mighty export is imported both surfaces light up together, and this
 * function starts returning real geography with no code change.
 *
 * Region-level only, and no counts are exposed: the sales pages carry no member
 * numbers.
 */
export async function getGlobeMarkers(limit = 8): Promise<GlobeData> {
  const placeholder: GlobeData = {
    markers: PLACEHOLDER_MARKERS.slice(0, limit).map((marker) => ({
      ...marker,
      placeholder: true,
    })),
    placeholder: true,
  };

  if (!process.env.DATABASE_URL) return placeholder;

  try {
    const rows = await prisma.memberGeoPoint.findMany({
      orderBy: { weight: "desc" },
      take: limit,
      select: {
        latitude: true,
        longitude: true,
        weight: true,
        city: true,
        region: true,
        country: true,
      },
    });
    if (rows.length === 0) return placeholder;

    const maxWeight = Math.max(...rows.map((row) => row.weight));
    return {
      markers: rows.map((row) => ({
        lat: row.latitude,
        lng: row.longitude,
        weight: maxWeight > 0 ? row.weight / maxWeight : 0.5,
        avatarUrl: PLACEHOLDER_AVATAR,
        // City or region at the finest, exactly as the heatmap rule requires.
        place: row.city ?? row.region ?? row.country,
        placeholder: false,
      })),
      placeholder: false,
    };
  } catch {
    return placeholder;
  }
}
