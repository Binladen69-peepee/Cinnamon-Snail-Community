import {
  BookOpen,
  Calendar,
  ClipboardList,
  Home,
  Map,
  MessageSquare,
  Plus,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export const MEMBER_NAV_LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/spaces", label: "Community", icon: Users },
  { href: "/learn", label: "Courses", icon: BookOpen },
  { href: "/members", label: "Members", icon: UserRound },
  { href: "/roadmap", label: "Roadmap", icon: Map },
  { href: "/calendar", label: "Events", icon: Calendar },
  { href: "/bulletin", label: "Bulletin Board", icon: ClipboardList },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

export const MEMBER_CREATE_LINK = {
  href: "/compose",
  label: "Create post",
  icon: Plus,
};
