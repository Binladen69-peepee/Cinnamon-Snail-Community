import {
  CalendarDays,
  HelpCircle,
  Image as ImageIcon,
  Link2,
  ListChecks,
  Soup,
  Video,
  type LucideIcon,
} from "lucide-react";

/**
 * A small badge naming what kind of post this is.
 *
 * Only shown for types that change how a post should be read — a plain text
 * post gets nothing, because labelling everything is the same as labelling
 * nothing.
 */
const TYPES: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  QUESTION: {
    label: "Question",
    icon: HelpCircle,
    tone: "bg-apricot/15 text-[#8a5a08]",
  },
  RECIPE: { label: "Recipe", icon: Soup, tone: "bg-sage text-forest" },
  POLL: { label: "Poll", icon: ListChecks, tone: "bg-sage text-forest" },
  EVENT: { label: "Event", icon: CalendarDays, tone: "bg-sage text-forest" },
  VIDEO: { label: "Video", icon: Video, tone: "bg-terracotta/15 text-terracotta" },
  IMAGE: { label: "Photo", icon: ImageIcon, tone: "bg-sage text-forest" },
  LINK: { label: "Link", icon: Link2, tone: "bg-mint text-foreground-muted" },
};

export function PostTypeBadge({ type }: { type: string }) {
  const entry = TYPES[type];
  if (!entry) return null;
  const Icon = entry.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${entry.tone}`}
    >
      <Icon className="size-3" aria-hidden />
      {entry.label}
    </span>
  );
}
