import {
  Angry,
  CircleHelp,
  Frown,
  HandHelping,
  Heart,
  HeartHandshake,
  Laugh,
  Lightbulb,
  PartyPopper,
  ThumbsUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  REACTION_TONE_CLASS,
  type ReactionDef,
  type ReactionIcon as ReactionIconName,
} from "@/lib/community/reactions";
import { cn } from "@/lib/utils";

/** One lucide glyph per reaction — no shared or stand-in icons. */
const GLYPHS: Record<ReactionIconName, LucideIcon> = {
  heart: Heart,
  thumbsUp: ThumbsUp,
  partyPopper: PartyPopper,
  handHelping: HandHelping,
  circleHelp: CircleHelp,
  heartHandshake: HeartHandshake,
  laugh: Laugh,
  zap: Zap,
  lightbulb: Lightbulb,
  frown: Frown,
  angry: Angry,
};

export function ReactionIcon({
  name,
  className,
  filled = false,
}: {
  name: ReactionIconName;
  className?: string;
  filled?: boolean;
}) {
  const Glyph = GLYPHS[name];
  return (
    <Glyph
      className={cn("size-4", className)}
      fill={
        filled &&
        (name === "heart" || name === "thumbsUp" || name === "lightbulb")
          ? "currentColor"
          : "none"
      }
      aria-hidden
    />
  );
}

/** Coloured circle used in the LinkedIn-style picker and summary stack. */
export function ReactionBadge({
  def,
  size = "md",
  className,
}: {
  def: ReactionDef;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim =
    size === "sm" ? "size-4" : size === "lg" ? "size-10" : "size-8";
  const icon =
    size === "sm" ? "size-2.5" : size === "lg" ? "size-5" : "size-4";

  return (
    <span
      title={def.label}
      className={cn(
        "inline-grid place-items-center rounded-full shadow-sm ring-2 ring-surface",
        REACTION_TONE_CLASS[def.tone],
        dim,
        className,
      )}
    >
      <ReactionIcon name={def.icon} className={icon} filled />
    </span>
  );
}
