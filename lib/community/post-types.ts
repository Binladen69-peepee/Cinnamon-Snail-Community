import {
  BookOpen,
  CalendarDays,
  ChefHat,
  HelpCircle,
  Link2,
  ListChecks,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

/**
 * The post types the composer can actually produce.
 *
 * `PostType` in the schema has eleven members and this lists seven. IMAGE and
 * VIDEO are left out deliberately: they are never picked, they are inferred
 * from what was attached. Offering them as buttons would let someone choose
 * VIDEO and attach a photograph. IDEA and BULLETIN belong to the Ideas board
 * and the Bulletin Board, which write them themselves (DEC-078).
 *
 * EVENT and RECIPE each write a row of their own — an Event with a date and a
 * place, a Recipe with a method — and the post points at it. A RECIPE post
 * with no recipe behind it would be a plain post wearing a label, which is why
 * neither existed until the rows could be written from here.
 *
 * `fields` is what drives the form, so a type and its inputs cannot drift
 * apart: adding a type here is what makes its fields appear.
 */

export type ComposerField =
  | "title"
  | "body"
  | "link"
  | "poll"
  | "media"
  | "event"
  | "recipe";

export type ComposerType = {
  value: "SIMPLE" | "ARTICLE" | "QUESTION" | "POLL" | "LINK" | "EVENT" | "RECIPE";
  label: string;
  hint: string;
  icon: LucideIcon;
  fields: ComposerField[];
  /** Placeholder for the body, which changes what people write in it. */
  bodyPlaceholder: string;
  titleLabel?: string;
  titleRequired?: boolean;
  /**
   * Offered to staff and hosts only. An EVENT post writes a real Event, and
   * every Event is listed under Live Classes (DEC-079), which are the
   * school's classes. Member gatherings belong on the Bulletin Board.
   */
  staffOnly?: boolean;
};

export const COMPOSER_TYPES: ComposerType[] = [
  {
    value: "SIMPLE",
    label: "Post",
    hint: "A note, a photo, something you cooked.",
    icon: MessageSquare,
    fields: ["body", "media"],
    bodyPlaceholder: "What are you cooking?",
  },
  {
    value: "QUESTION",
    label: "Question",
    hint: "Ask the community something.",
    icon: HelpCircle,
    fields: ["title", "body", "media"],
    bodyPlaceholder: "Add any detail that would help someone answer.",
    titleLabel: "Your question",
    titleRequired: true,
  },
  {
    value: "ARTICLE",
    label: "Article",
    hint: "Something longer, with a headline.",
    icon: BookOpen,
    fields: ["title", "body", "media"],
    bodyPlaceholder: "Write it out.",
    titleLabel: "Headline",
    titleRequired: true,
  },
  {
    value: "POLL",
    label: "Poll",
    hint: "Ask people to choose.",
    icon: ListChecks,
    fields: ["title", "body", "poll"],
    bodyPlaceholder: "Any context for the question (optional).",
    titleLabel: "Poll question",
    titleRequired: true,
  },
  {
    value: "LINK",
    label: "Link",
    hint: "Share something from elsewhere.",
    icon: Link2,
    fields: ["title", "body", "link"],
    bodyPlaceholder: "Why is it worth reading? (optional)",
    titleLabel: "Title",
  },
  {
    value: "EVENT",
    label: "Live class",
    hint: "A class with a time, listed under Live Classes as well as here.",
    icon: CalendarDays,
    fields: ["title", "body", "event", "media"],
    bodyPlaceholder: "What will people cook, and what should they have ready?",
    titleLabel: "What is it called",
    titleRequired: true,
    staffOnly: true,
  },
  {
    value: "RECIPE",
    label: "Recipe",
    hint: "Something you cooked, written down properly.",
    icon: ChefHat,
    fields: ["title", "body", "recipe", "media"],
    bodyPlaceholder: "Say a little about it. The method goes below.",
    titleLabel: "Recipe name",
    titleRequired: true,
  },
];


/** Poll options the create action reads. It looks for poll1..poll4, so: four. */
export const MAX_POLL_OPTIONS = 4;
export const MIN_POLL_OPTIONS = 2;

/** The longest post body and title the create action accepts. */
export const POST_BODY_MAX = 5000;
export const POST_TITLE_MAX = 300;

/**
 * The types a member may pick: every type for staff and hosts, all but the
 * staff-only ones for everyone else.
 */
export function composerTypesFor(isStaff: boolean): ComposerType[] {
  return COMPOSER_TYPES.filter((type) => isStaff || !type.staffOnly);
}

/**
 * The post types the create action accepts from a form.
 *
 * Only what the composer can produce, plus IMAGE and VIDEO, which are inferred
 * from attachments. IDEA and BULLETIN are written by the Ideas board and the
 * Bulletin Board themselves (DEC-078) and are never accepted from here: an
 * IDEA posted into the Kitchen Table would be invisible, and a BULLETIN post
 * with no item behind it would be a plain post wearing a label.
 */
export const ACCEPTED_POST_TYPES = [
  ...COMPOSER_TYPES.map((type) => type.value),
  "IMAGE",
  "VIDEO",
] as const;

export type AcceptedPostType = (typeof ACCEPTED_POST_TYPES)[number];

export function parseAcceptedPostType(value: unknown): AcceptedPostType | null {
  return typeof value === "string" &&
    (ACCEPTED_POST_TYPES as readonly string[]).includes(value)
    ? (value as AcceptedPostType)
    : null;
}

export function isStaffOnlyType(value: string): boolean {
  return COMPOSER_TYPES.some((type) => type.value === value && type.staffOnly);
}

export function parseComposerType(
  value: string | string[] | undefined,
  options: { isStaff?: boolean } = {},
): ComposerType {
  const raw = Array.isArray(value) ? value[0] : value;
  const available = composerTypesFor(options.isStaff ?? true);
  return available.find((type) => type.value === raw) ?? COMPOSER_TYPES[0]!;
}

export function typeHasField(type: ComposerType, field: ComposerField): boolean {
  return type.fields.includes(field);
}

/**
 * Whether the form is complete enough to post, using the same rules the server
 * enforces. Returns the reason it is not, so the button can say why rather than
 * just sitting greyed out.
 *
 * There is no "pick a space" step any more: every post goes to the Kitchen
 * Table (DEC-078). `spaceId` is still accepted so older callers type-check,
 * and is ignored.
 */
export function describeIncomplete(input: {
  type: ComposerType;
  title: string;
  body: string;
  link: string;
  pollOptions: string[];
  attachments: number;
  spaceId?: string;
  startsAt?: string;
  method?: string;
}): string | null {
  if (input.type.titleRequired && !input.title.trim()) {
    return `${input.type.titleLabel ?? "A title"} is needed.`;
  }

  if (typeHasField(input.type, "link") && !input.link.trim()) {
    return "Paste the link you want to share.";
  }

  if (typeHasField(input.type, "poll")) {
    const filled = input.pollOptions.filter((option) => option.trim()).length;
    if (filled < MIN_POLL_OPTIONS) {
      // Worded identically to the server's refusal, so a member cannot be told
      // two different things about the same rule.
      return "A poll needs at least two options.";
    }
  }

  if (typeHasField(input.type, "event")) {
    if (!input.startsAt?.trim()) return "An event needs a start time.";
    if (new Date(input.startsAt).toString() === "Invalid Date") {
      return "That start time is not one we can read.";
    }
  }

  if (typeHasField(input.type, "recipe") && !input.method?.trim()) {
    return "Write the method, even roughly.";
  }

  const hasSomething =
    input.body.trim() || input.title.trim() || input.attachments > 0;
  if (!hasSomething) return "Write something or add a photo first.";

  return null;
}
