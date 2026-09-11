import {
  BookOpen,
  Calendar,
  ClipboardList,
  Compass,
  Handshake,
  Home,
  Map,
  MessageSquare,
  Plus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavLink = { href: string; label: string; icon: LucideIcon };

/**
 * The member rail, grouped.
 *
 * A flat list of nine destinations gave no sense of which ones belong together,
 * and it stops scaling the moment there are more. These groups follow the
 * blueprint's information architecture: where you are, where the people are,
 * and what you are learning.
 */
export const MEMBER_NAV_GROUPS: { label: string | null; links: NavLink[] }[] = [
  {
    label: null,
    links: [
      { href: "/home", label: "Home", icon: Home },
      { href: "/discover", label: "Discover", icon: Compass },
    ],
  },
  {
    label: "Community",
    links: [
      { href: "/spaces", label: "Spaces", icon: Users },
      { href: "/members", label: "Members", icon: UserRound },
      { href: "/connect", label: "Connect", icon: Handshake },
      { href: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    label: "Learning",
    links: [
      { href: "/learn", label: "Courses", icon: BookOpen },
      { href: "/calendar", label: "Events", icon: Calendar },
      { href: "/roadmap", label: "Roadmap", icon: Map },
    ],
  },
  {
    label: "Local",
    links: [{ href: "/bulletin", label: "Bulletin Board", icon: ClipboardList }],
  },
];

/** Flat list, for the mobile sheet and anywhere that just needs every route. */
export const MEMBER_NAV_LINKS: NavLink[] = MEMBER_NAV_GROUPS.flatMap(
  (group) => group.links,
);

/**
 * Mobile tab bar, per the blueprint: Home, Discover, Events, Messages, Profile,
 * with create as the centre action. Was Home / Community / Create / Messages /
 * Profile, which buried both discovery and events.
 */
export const MOBILE_TABS: NavLink[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/calendar", label: "Events", icon: Calendar },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/settings", label: "Profile", icon: UserRound },
];

export const MEMBER_CREATE_LINK = {
  href: "/compose",
  label: "Create post",
  icon: Plus,
};
