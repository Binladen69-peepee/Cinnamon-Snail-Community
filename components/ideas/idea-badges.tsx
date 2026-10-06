import {
  CalendarClock,
  CheckCircle2,
  ChefHat,
  CircleDot,
  CircleSlash,
  Eye,
  GitMerge,
  Lightbulb,
  MonitorPlay,
  Puzzle,
  type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/app/ui";
import {
  IDEA_CATEGORIES,
  IDEA_STATUSES,
  type IdeaCategoryValue,
  type IdeaStatusValue,
} from "@/lib/ideas/constants";

/**
 * An idea's status and category, as badges. The words carry the meaning; the
 * colour and the icon only repeat it.
 */

const STATUS_TONE: Record<IdeaStatusValue, BadgeTone> = {
  OPEN: "outline",
  UNDER_REVIEW: "info",
  PLANNED: "brand",
  DONE: "success",
  DECLINED: "neutral",
};

export const STATUS_ICON: Record<IdeaStatusValue, LucideIcon> = {
  OPEN: CircleDot,
  UNDER_REVIEW: Eye,
  PLANNED: CalendarClock,
  DONE: CheckCircle2,
  DECLINED: CircleSlash,
};

export const CATEGORY_ICON: Record<IdeaCategoryValue, LucideIcon> = {
  CLASS: MonitorPlay,
  RECIPE: ChefHat,
  FEATURE: Puzzle,
  OTHER: Lightbulb,
};

export function IdeaStatusBadge({
  status,
  className,
}: {
  status: IdeaStatusValue;
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge tone={STATUS_TONE[status]} icon={<Icon aria-hidden />} className={className}>
      {IDEA_STATUSES[status].label}
    </Badge>
  );
}

export function IdeaCategoryBadge({
  category,
  className,
}: {
  category: IdeaCategoryValue;
  className?: string;
}) {
  const Icon = CATEGORY_ICON[category];
  return (
    <Badge tone="neutral" icon={<Icon aria-hidden />} className={className}>
      {IDEA_CATEGORIES[category].label}
    </Badge>
  );
}

export function IdeaMergedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="neutral" icon={<GitMerge aria-hidden />} className={className}>
      Merged
    </Badge>
  );
}
