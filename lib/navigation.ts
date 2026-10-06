import {
  BookOpen,
  ClipboardList,
  CreditCard,
  FileText,
  Handshake,
  Lightbulb,
  Map,
  MessageSquare,
  Plus,
  Settings,
  Users,
  UtensilsCrossed,
  Video,
  type LucideIcon,
} from "lucide-react";
import { MEMBER_HOME_PATH } from "@/lib/auth/redirects";
import { NAV_SECTION_SUGGESTIONS, type SearchSuggestion } from "@/lib/search/suggest";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Other addresses that belong to this destination, so it stays lit there:
   * a post opened from the Kitchen Table, a crew reached from Connect.
   */
  also?: string[];
};

/** Where the brand mark and every "back to the community" link go. */
export const MEMBER_HOME_HREF = MEMBER_HOME_PATH;

/**
 * The member menu, grouped: the people, then the learning.
 *
 * Community is exactly the five places the client named (Kitchen Table,
 * Bulletin Board, Members, Connect, Messages). Spaces, Drafts, Local and
 * Explorer are gone from it: the Kitchen Table is the community feed now
 * (DEC-078), so Explorer and the list of rooms were two more ways into the
 * same posts, and the bulletin board is part of the community rather than a
 * group of its own. Drafts moved to the account menu, beside the other things
 * a member visits deliberately rather than daily.
 *
 * The rail, the drawer, the phone sheet and the search palette all read this
 * one table, so they cannot drift apart.
 */
export const MEMBER_NAV_GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: "Community",
    links: [
      { href: MEMBER_HOME_PATH, label: "Kitchen Table", icon: UtensilsCrossed, also: ["/posts"] },
      { href: "/bulletin", label: "Bulletin Board", icon: ClipboardList },
      { href: "/members", label: "Members", icon: Users },
      { href: "/connect", label: "Connect", icon: Handshake, also: ["/crews"] },
      { href: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    label: "Learning",
    links: [
      { href: "/learn", label: "Classes", icon: BookOpen },
      { href: "/live-classes", label: "Live Classes", icon: Video },
      { href: "/roadmap", label: "Roadmap", icon: Map },
      { href: "/ideas", label: "Ideas & Requests", icon: Lightbulb },
    ],
  },
];

/** Flat list, for the phone sheet and anywhere that just needs every route. */
export const MEMBER_NAV_LINKS: NavLink[] = MEMBER_NAV_GROUPS.flatMap(
  (group) => group.links,
);

export type MobileTab = NavLink & {
  /** What the tab shows when the full name does not fit a fifth of 320px. */
  shortLabel?: string;
  /** The raised centre action rather than a destination. */
  primary?: boolean;
};

/**
 * The phone tab bar: the feed, the library, create in the middle, what is on
 * live, and messages. Search is reached from the header's search button on
 * phones, and everything else from the menu drawer.
 */
export const MOBILE_TABS: MobileTab[] = [
  {
    href: MEMBER_HOME_PATH,
    label: "Kitchen Table",
    shortLabel: "Kitchen",
    icon: UtensilsCrossed,
    also: ["/posts"],
  },
  { href: "/learn", label: "Classes", icon: BookOpen },
  { href: "/compose", label: "Create post", shortLabel: "Create", icon: Plus, primary: true },
  { href: "/live-classes", label: "Live Classes", shortLabel: "Live", icon: Video },
  { href: "/messages", label: "Messages", icon: MessageSquare },
];

export const MEMBER_CREATE_LINK = {
  href: "/compose",
  label: "Create post",
  icon: Plus,
};

/**
 * The account menu's own destinations: occasional, deliberate visits. Drafts
 * lives here now that it has left the community menu, so drafts, scheduled
 * posts and posts waiting on a host are still one click away.
 */
export const ACCOUNT_LINKS: NavLink[] = [
  { href: "/drafts", label: "Drafts", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Membership", icon: CreditCard },
];

/** Whether `link` is the destination the member is on. */
export function isNavActive(
  pathname: string,
  link: Pick<NavLink, "href" | "also">,
): boolean {
  return [link.href, ...(link.also ?? [])].some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

/**
 * Words people use for a destination under its old name, or for what it
 * holds. Matched by the search palette, never shown: someone typing "events"
 * or "courses" still finds the renamed page.
 */
const KEYWORDS: Record<string, string> = {
  [MEMBER_HOME_PATH]: "feed home explorer community posts forum",
  "/bulletin": "local listings happenings places notices",
  "/members": "directory people profiles",
  "/connect": "match crews cohort meet",
  "/messages": "inbox chat direct dm",
  "/learn": "courses library lessons class portal",
  "/live-classes": "events calendar zoom cook-along live",
  "/roadmap": "plan pacing path topics",
  "/ideas": "requests suggestions vote feature",
  "/notifications": "alerts activity",
  "/drafts": "scheduled unpublished review",
  "/settings": "profile account preferences password",
  "/billing": "subscription plan payment billing",
};

const suggestion = (link: { href: string; label: string }, group: string): SearchSuggestion => ({
  label: link.label,
  href: link.href,
  group,
  detail: `${group} · ${link.href}`,
  snippet: KEYWORDS[link.href],
});

/**
 * Every member destination, for the search palette: the menu in its own
 * order, then the account pages.
 */
export const MEMBER_DESTINATIONS: SearchSuggestion[] = [
  ...MEMBER_NAV_GROUPS.flatMap((group) =>
    group.links.map((link) => suggestion(link, group.label)),
  ),
  suggestion({ href: "/notifications", label: "Notifications" }, "Account"),
  ...ACCOUNT_LINKS.map((link) => suggestion(link, "Account")),
];

/**
 * The palette's list: the catalog rows the search library found (the next
 * live class, the classes), then the member destinations above.
 *
 * The library's own standing list of sections still names Explorer, Spaces and
 * Events, so those rows are dropped wherever they appear and the menu's
 * destinations stand in for them. Rows are compared whole, so a catalog row
 * that happens to share an address with a section survives.
 */
export function withMemberDestinations(rows: SearchSuggestion[]): SearchSuggestion[] {
  const standing = new Set(NAV_SECTION_SUGGESTIONS.map((row) => `${row.href} ${row.label}`));
  return [
    ...rows.filter((row) => !standing.has(`${row.href} ${row.label}`)),
    ...MEMBER_DESTINATIONS,
  ];
}
