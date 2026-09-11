import { NotificationCategory } from "@prisma/client";

/**
 * Which categories a member wants, per channel.
 *
 * Stored as JSON on Profile rather than a row per category, because it is a
 * small closed set read on every notification write — a join for eight
 * booleans is not worth it.
 *
 * A missing record, or a missing key inside one, means "yes, in-app". That is
 * exactly how the product behaved before preferences existed, so nothing
 * changes for anyone who never opens the settings.
 */
export type NotificationPrefs = {
  inApp: Partial<Record<NotificationCategory, boolean>>;
  email: Partial<Record<NotificationCategory, boolean>>;
};

export type PrefChannel = keyof NotificationPrefs;

/** Every category a member can actually control, with plain-language labels. */
export const PREF_ROWS: {
  category: NotificationCategory;
  label: string;
  hint: string;
}[] = [
  {
    category: "REPLIES",
    label: "Replies",
    hint: "Someone answers your post or comment",
  },
  {
    category: "MENTIONS",
    label: "Mentions",
    hint: "Someone writes @your-handle",
  },
  { category: "DMS", label: "Messages", hint: "A direct message arrives" },
  {
    category: "SPACE_ACTIVITY",
    label: "Space activity",
    hint: "New posts in the spaces you have joined",
  },
  {
    category: "EVENTS",
    label: "Event reminders",
    hint: "A cook-along you said you would attend is starting",
  },
  {
    category: "HOST_ANNOUNCEMENTS",
    label: "Host announcements",
    hint: "Adam posts something for everyone",
  },
  { category: "DIGESTS", label: "Weekly digest", hint: "A summary of the week" },
];

/**
 * SYSTEM is deliberately absent from PREF_ROWS: billing and account
 * notifications are not optional, and offering a switch that is ignored is
 * worse than offering none.
 */
export const UNSWITCHABLE: NotificationCategory[] = ["SYSTEM"];

const EMPTY: NotificationPrefs = { inApp: {}, email: {} };

/** Read whatever is stored, tolerating anything that is not the shape. */
export function parsePrefs(raw: unknown): NotificationPrefs {
  if (typeof raw !== "object" || raw === null) return EMPTY;
  const record = raw as Record<string, unknown>;
  return {
    inApp: pickChannel(record.inApp),
    email: pickChannel(record.email),
  };
}

function pickChannel(value: unknown): Partial<Record<NotificationCategory, boolean>> {
  if (typeof value !== "object" || value === null) return {};
  const out: Partial<Record<NotificationCategory, boolean>> = {};
  for (const [key, on] of Object.entries(value as Record<string, unknown>)) {
    if (key in NotificationCategory && typeof on === "boolean") {
      out[key as NotificationCategory] = on;
    }
  }
  return out;
}

/**
 * In-app defaults to on; email defaults to off for everything except the
 * things a member would want to know about while away from the app.
 */
const EMAIL_DEFAULT_ON: NotificationCategory[] = ["DMS", "EVENTS", "SYSTEM"];

export function wants(
  prefs: NotificationPrefs,
  channel: PrefChannel,
  category: NotificationCategory,
): boolean {
  if (UNSWITCHABLE.includes(category)) return true;
  const explicit = prefs[channel][category];
  if (typeof explicit === "boolean") return explicit;
  return channel === "inApp" ? true : EMAIL_DEFAULT_ON.includes(category);
}
