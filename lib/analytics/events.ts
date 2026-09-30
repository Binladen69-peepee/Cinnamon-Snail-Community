/**
 * Every product event the app sends, and what each may carry.
 *
 * Deliberately short. Each is a step in the journey the product is built
 * around — join, take part, keep going — and each carries only shape, never
 * content: whether a post had media, not what it said; whether a message was
 * to a group, not who or what. Typed here so adding a property is a visible
 * change to this file rather than something a call site does quietly.
 */
export type ProductEvents = {
  member_signed_up: Record<string, never>;
  post_created: { post_type: string; has_media: boolean; scheduled: boolean };
  comment_created: { is_reply: boolean };
  message_sent: { has_image: boolean };
  roadmap_track_started: { cadence: string };
  roadmap_milestone_completed: { track_complete: boolean };
  roadmap_milestone_skipped: Record<string, never>;
};

export type ProductEvent = keyof ProductEvents;
