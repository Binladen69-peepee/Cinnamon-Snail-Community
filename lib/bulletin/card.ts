/**
 * The shape of a Bulletin Board item as the Kitchen Table shows it (DEC-078),
 * and the words for where it stands.
 *
 * Pure and client-safe, because the card that renders it sits inside the
 * feed's client post card. `lib/bulletin/feed.ts` re-exports the type, which is
 * the contract the feed codes against.
 */

export type BulletinKind = "happening" | "service" | "place";

/**
 * Where the item stands, which decides what the card says.
 *
 * - `live`: on the board now.
 * - `past`: a gathering that has happened.
 * - `canceled`: a gathering its host called off.
 * - `review`: a service card being checked again after an edit.
 * - `withdrawn`: a service the member took down.
 * - `unlisted`: off the board for any other reason (rejected, or the
 *   member's account is no longer active).
 */
export type BulletinCardState =
  | "live"
  | "past"
  | "canceled"
  | "review"
  | "withdrawn"
  | "unlisted";

export type BulletinCardData = {
  postId: string;
  kind: BulletinKind;
  /** The item's own id (Happening / MemberCard / Place). */
  itemId: string;
  title: string;
  /** Plain text, no markup. Empty when the item is no longer live. */
  summary: string;
  /** City only, never an address. */
  city: string | null;
  /** When it happens, for a happening. ISO string. */
  startsAt: string | null;
  /** Small label: "Potluck", "Catering", "Fully vegan café"... */
  label: string | null;
  /** Where the full item lives on the Bulletin Board. */
  href: string;
  /** False when the item was canceled or withdrawn; the post then says so. */
  active: boolean;
  /** Why it is or is not live. Optional so older callers keep compiling. */
  state?: BulletinCardState;
  /**
   * The reader's saved time zone, so a happening's time is rendered on the
   * server in the zone the browser will then confirm (no hydration jump).
   */
  timeZone?: string | null;
  /** A happening's approved guests and its cap. Counts only, never names. */
  going?: number | null;
  capacity?: number | null;
  /** Where the reader stands with a happening. */
  viewerRsvp?: "requested" | "approved" | "declined" | null;
  isHost?: boolean;
};

export const BULLETIN_KIND_NAME: Record<BulletinKind, string> = {
  happening: "Happening",
  service: "Member service",
  place: "Vegan place",
};

/** The badge and the one sentence an inactive card shows. */
export const BULLETIN_STATE_COPY: Record<
  Exclude<BulletinCardState, "live">,
  { badge: string; sentence: string }
> = {
  past: {
    badge: "Took place",
    sentence: "This gathering has already happened.",
  },
  canceled: {
    badge: "Called off",
    sentence: "The host called this gathering off.",
  },
  review: {
    badge: "In review",
    sentence: "This service is being checked again after an edit.",
  },
  withdrawn: {
    badge: "No longer offered",
    sentence: "The member has taken this service down.",
  },
  unlisted: {
    badge: "No longer listed",
    sentence: "This is no longer on the Bulletin Board.",
  },
};

/** The state a card is in, for older data that only carries `active`. */
export function cardState(data: Pick<BulletinCardData, "active" | "state">): BulletinCardState {
  if (data.state) return data.state;
  return data.active ? "live" : "unlisted";
}

/** The id each item carries on the board, so a link can land on it. */
export function bulletinAnchor(kind: BulletinKind, id: string): string {
  return `${kind}-${id}`;
}

/** Where an item lives on the Bulletin Board. */
export function bulletinItemHref(kind: BulletinKind, id: string): string {
  const anchor = bulletinAnchor(kind, id);
  if (kind === "happening") return `/bulletin#${anchor}`;
  if (kind === "service") return `/bulletin?tab=services#${anchor}`;
  return `/bulletin?tab=places#${anchor}`;
}
