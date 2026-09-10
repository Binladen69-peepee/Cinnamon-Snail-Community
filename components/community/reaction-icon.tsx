import {
  Angry,
  CircleHelp,
  Frown,
  HandHelping,
  Heart,
  HeartHandshake,
  Laugh,
  PartyPopper,
  ThumbsUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactionIcon as ReactionIconName } from "@/lib/community/reactions";
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
      // Only the shapes that read well filled get a fill.
      fill={filled && (name === "heart" || name === "thumbsUp") ? "currentColor" : "none"}
      aria-hidden
    />
  );
}
