import {
  BookOpen,
  HelpCircle,
  Link2,
  ListChecks,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

/**
 * The post types the composer can actually produce.
 *
 * `PostType` in the schema has nine members; this lists the six a member can
 * choose. The other three are not omissions:
 *
 * - IMAGE and VIDEO are never picked, they are inferred. `createPostAction`
 *   sets them from what was attached, so offering them as buttons would let
 *   someone choose VIDEO and attach a photo.
 * - EVENT is created on the calendar, not here, because an event needs a date,
 *   a capacity and RSVPs rather than a body.
 * - RECIPE has a Recipe table of its own with variations and no authoring
 *   screen yet; a RECIPE post with none of that attached would be a SIMPLE
 *   post wearing a label.
 *
 * `fields` is what drives the form, so a type and its inputs cannot drift
 * apart — adding a type here is what makes its fields appear.
 */

export type ComposerField = "title" | "body" | "link" | "poll" | "media";

export type ComposerType = {
  value: "SIMPLE" | "ARTICLE" | "QUESTION" | "POLL" | "LINK";
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

  const hasSomething =
    input.body.trim() || input.title.trim() || input.attachments > 0;
  if (!hasSomething) return "Write something or add a photo first.";

  return null;
}
