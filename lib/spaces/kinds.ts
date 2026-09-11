import {
  BookOpen,
  CalendarDays,
  Hash,
  MessagesSquare,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { SpaceKind, SpaceVisibility } from "@/lib/spaces";

/**
 * A space's kind decides what it is *for*, and therefore which tabs it opens
 * with and which icon it carries in the rail. This is Circle's typed-space
 * idea: a course room and a chat room are not the same object wearing different
 * labels.
 */
export const SPACE_KIND_ICON: Record<SpaceKind, LucideIcon> = {
  FEED: Hash,
  CHAT: MessagesSquare,
  EVENTS: CalendarDays,
  COURSE: BookOpen,
  MEMBERS: Users,
};

export const SPACE_KIND_LABEL: Record<SpaceKind, string> = {
  FEED: "Feed",
  CHAT: "Chat",
  EVENTS: "Events",
  COURSE: "Course",
  MEMBERS: "Members",
};

/** What this kind of space is for, in the member's language. */
export const SPACE_KIND_BLURB: Record<SpaceKind, string> = {
  FEED: "Posts, questions and photos of what you cooked",
  CHAT: "Quick back-and-forth, not long posts",
  EVENTS: "Live cook-alongs and the calendar",
  COURSE: "Lessons, progress and lesson discussion",
  MEMBERS: "Introductions and who is here",
};

export const SPACE_VISIBILITY_LABEL: Record<SpaceVisibility, string> = {
  PUBLIC: "Open to all",
  MEMBERS: "Open to members",
  PRIVATE: "Private",
};

/**
 * Which tabs a space opens with.
 *
 * Every space has a feed and an About; the rest follow the kind, so a chat
 * space does not present an empty Courses tab. "Members" is always available
 * because knowing who is in a room is never irrelevant.
 */
export function tabsForKind(kind: SpaceKind): string[] {
  const base = ["feed"];
  if (kind === "EVENTS") base.push("events");
  if (kind === "COURSE") base.push("courses");
  base.push("members", "about");
  return base;
}
