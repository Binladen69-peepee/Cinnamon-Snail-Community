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
  push: Partial<Record<NotificationCategory, boolean>>;
};

export type PrefChannel = keyof NotificationPrefs;

export const PREF_CHANNELS: { channel: PrefChannel; label: string }[] = [
  { channel: "inApp", label: "In app" },
  { channel: "email", label: "Email" },
  { channel: "push", label: "Push" },
];

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
    // The enum keeps its old name; members no longer see spaces (DEC-078).
    // What it carries now: crew chat activity, community posts from rooms the
    // member follows, new followers and badges earned.
    category: "SPACE_ACTIVITY",
    label: "Group activity",
    hint: "Your crew chats, new community posts, new followers and badges",
  },
  {
    // Live classes (DEC-079), and the Bulletin Board gatherings that share
    // the category, so switching it off is never a surprise.
    category: "EVENTS",
    label: "Live class reminders",
    hint: "Live classes you’re going to, and Bulletin Board gatherings you host or join",
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

const EMPTY: NotificationPrefs = { inApp: {}, email: {}, push: {} };

/** Read whatever is stored, tolerating anything that is not the shape. */
export function parsePrefs(raw: unknown): NotificationPrefs {
  if (typeof raw !== "object" || raw === null) return EMPTY;
  const record = raw as Record<string, unknown>;
  return {
    inApp: pickChannel(record.inApp),
    email: pickChannel(record.email),
    push: pickChannel(record.push),
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
 * things a member would want to know about while away from the app. Push
 * defaults match email, but push only ever reaches a browser the member
 * explicitly enabled, so "on" there still starts as nobody.
 */
const EMAIL_DEFAULT_ON: NotificationCategory[] = ["DMS", "EVENTS", "SYSTEM"];
const PUSH_DEFAULT_ON: NotificationCategory[] = [
  "DMS",
  "EVENTS",
  "REPLIES",
  "MENTIONS",
  "SYSTEM",
];

export function wants(
  prefs: NotificationPrefs,
  channel: PrefChannel,
  category: NotificationCategory,
): boolean {
  if (UNSWITCHABLE.includes(category)) return true;
  const explicit = prefs[channel][category];
  if (typeof explicit === "boolean") return explicit;
  if (channel === "inApp") return true;
  return (channel === "email" ? EMAIL_DEFAULT_ON : PUSH_DEFAULT_ON).includes(category);
}

/**
 * Reads the preference form. Every switchable category gets an explicit
 * boolean per channel, so what is saved is exactly what was on screen rather
 * than "whatever was ticked, plus defaults for the rest".
 */
export function prefsFromForm(formData: FormData): NotificationPrefs {
  const out: NotificationPrefs = { inApp: {}, email: {}, push: {} };
  for (const { channel } of PREF_CHANNELS) {
    for (const { category } of PREF_ROWS) {
      out[channel][category] = formData.get(`${channel}:${category}`) === "on";
    }
  }
  return out;
}

/** One category switched off for one channel, everything else untouched. */
export function withChannelOff(
  prefs: NotificationPrefs,
  channel: PrefChannel,
  category: NotificationCategory,
): NotificationPrefs {
  if (UNSWITCHABLE.includes(category)) return prefs;
  return { ...prefs, [channel]: { ...prefs[channel], [category]: false } };
}
