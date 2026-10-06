import Link from "next/link";
import {
  Award,
  BarChart3,
  BookOpen,
  ChefHat,
  ChevronRight,
  Flag,
  GraduationCap,
  HelpCircle,
  Images,
  Lightbulb,
  MessageCircle,
  MessageSquare,
  Pin,
  Shuffle,
  Video,
  type LucideIcon,
} from "lucide-react";
import { formatShortTime } from "@/lib/community/format-count";
import type { ActivityItem, ActivityKind } from "@/lib/social/activity";
import { cn } from "@/lib/utils";

const ICONS: Record<ActivityKind, LucideIcon> = {
  post: MessageSquare,
  question: HelpCircle,
  recipe: ChefHat,
  media: Images,
  poll: BarChart3,
  idea: Lightbulb,
  bulletin: Pin,
  comment: MessageCircle,
  variation: Shuffle,
  challenge: Flag,
  "live-class": Video,
  lesson: BookOpen,
  class: GraduationCap,
  badge: Award,
};

/**
 * Activity rows. Each one is a link to the exact place it happened: a post, a
 * comment on its post (scrolled to), an idea, a lesson, a class, a live class,
 * a challenge, a recipe's variations, a badge.
 *
 * The whole row is the link, so a thumb anywhere on it works, and the label is
 * what a screen reader announces as the link's name.
 */
export function ActivityList({
  items,
  compact = false,
}: {
  items: ActivityItem[];
  compact?: boolean;
}) {
  return (
    <ul className={compact ? "flex flex-col gap-0.5 p-2" : "divide-y divide-separator"}>
      {items.map((item) => (
        <ActivityRow key={item.id} item={item} compact={compact} />
      ))}
    </ul>
  );
}

function ActivityRow({ item, compact }: { item: ActivityItem; compact: boolean }) {
  const Icon = ICONS[item.kind];
  const at = new Date(item.at);
  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "group flex items-start gap-3 no-underline transition hover:bg-surface-muted",
          compact ? "rounded-ctl px-2 py-2" : "px-4 py-3 sm:px-5",
        )}
      >
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-full bg-brand-wash text-on-brand-wash",
            compact ? "size-7" : "mt-0.5 size-8",
          )}
          aria-hidden
        >
          <Icon className={compact ? "size-3.5" : "size-4"} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block font-medium text-foreground transition group-hover:text-brand-strong",
              compact ? "text-label" : "text-body",
            )}
          >
            {item.label}
          </span>
          {item.detail ? (
            <span
              className={cn(
                "mt-0.5 block text-foreground-muted",
                compact ? "line-clamp-1 text-caption" : "line-clamp-2 text-label",
              )}
            >
              {item.detail}
            </span>
          ) : null}
          <time
            dateTime={at.toISOString()}
            // Relative time is computed where it is shown; the server's "3d"
            // and the browser's can differ by a render, which is harmless.
            suppressHydrationWarning
            className="mt-0.5 block text-caption text-foreground-muted"
          >
            {formatShortTime(at)}
          </time>
        </span>
        <ChevronRight
          className="mt-1 size-4 shrink-0 text-foreground-muted opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
      </Link>
    </li>
  );
}
