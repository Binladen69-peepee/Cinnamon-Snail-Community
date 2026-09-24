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
 * `PostType` in the schema has nine members and this lists seven. IMAGE and
 * VIDEO are the two left out, and deliberately: they are never picked, they
 * are inferred from what was attached. Offering them as buttons would let
 * someone choose VIDEO and attach a photograph.
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
    label: "Event",
    hint: "A cook-along, a meet-up, anything with a time.",
    icon: CalendarDays,
    fields: ["title", "body", "event", "media"],
    bodyPlaceholder: "What happens, and what should people bring?",
    titleLabel: "What is it called",
    titleRequired: true,
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

export function parseComposerType(
  value: string | string[] | undefined,
): ComposerType {
  const raw = Array.isArray(value) ? value[0] : value;
  return (
    COMPOSER_TYPES.find((type) => type.value === raw) ?? COMPOSER_TYPES[0]
  );
}

export function typeHasField(type: ComposerType, field: ComposerField): boolean {
  return type.fields.includes(field);
}

/**
 * Whether the form is complete enough to post, using the same rules the server
 * enforces. Returns the reason it is not, so the button can say why rather than
 * just sitting greyed out.
 */
export function describeIncomplete(input: {
  type: ComposerType;
  title: string;
  body: string;
  link: string;
  pollOptions: string[];
  attachments: number;
  spaceId: string;
  startsAt?: string;
  method?: string;
}): string | null {
  if (!input.spaceId) return "Pick a space to post in.";

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
