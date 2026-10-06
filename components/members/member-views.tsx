import {
  Compass,
  Flame,
  HeartHandshake,
  MapPin,
  Sprout,
  Users,
  type LucideIcon,
} from "lucide-react";
import { TabBar, TabLink } from "@/components/app/ui";
import type { ClusterView, MemberView } from "@/lib/community/directory";

/**
 * The views of the Members page, Mighty Networks' People Explorer style:
 * Discover (every cluster at a glance), each cluster on its own, and the
 * searchable directory of everyone.
 */
export type ClusterMeta = {
  title: string;
  /** One line on how the list is made. Honest about the rule. */
  description: string;
  icon: LucideIcon;
  empty: { title: string; description: string };
};

export const CLUSTER_META: Record<ClusterView, ClusterMeta> = {
  top: {
    title: "Top members",
    description: "The most active voices in the community over the last 30 days: posts and replies.",
    icon: Flame,
    empty: {
      title: "Nobody has posted for a while",
      description: "Members who post or reply in the Kitchen Table show up here.",
    },
  },
  near: {
    title: "Members near you",
    description: "In your city first, then your region and country. Only members who show their location.",
    icon: MapPin,
    empty: {
      title: "No one nearby yet",
      description: "Members who show their city on their profile appear here when they live near you.",
    },
  },
  new: {
    title: "New members",
    description: "Joined in the last 60 days. Say hello and make them feel at home.",
    icon: Sprout,
    empty: {
      title: "No new members lately",
      description: "Everyone who joined in the last 60 days shows up here.",
    },
  },
  similar: {
    title: "Similar to you",
    description: "Members who share your interests, crews, classes, city or cooking level.",
    icon: HeartHandshake,
    empty: {
      title: "Nobody to compare with yet",
      description:
        "Add your interests, skill level and city to your profile, and members who share them will show up here.",
    },
  },
};

const TAB_LABEL: Record<MemberView, string> = {
  discover: "Discover",
  top: "Top members",
  near: "Near you",
  new: "New members",
  similar: "Similar to you",
  all: "All members",
};

const TAB_ICON: Record<MemberView, LucideIcon> = {
  discover: Compass,
  top: Flame,
  near: MapPin,
  new: Sprout,
  similar: HeartHandshake,
  all: Users,
};

export function memberViewHref(view: MemberView): string {
  return view === "discover" ? "/members" : `/members?view=${view}`;
}

export function MemberViewTabs({
  view,
  viewerHasLocation,
}: {
  view: MemberView;
  viewerHasLocation: boolean;
}) {
  const views: MemberView[] = ["discover", "top", "near", "new", "similar", "all"];
  return (
    <TabBar label="Member views">
      {views
        .filter((option) => option !== "near" || viewerHasLocation)
        .map((option) => {
          const Icon = TAB_ICON[option];
          return (
            <TabLink key={option} href={memberViewHref(option)} active={option === view}>
              <Icon aria-hidden />
              {TAB_LABEL[option]}
            </TabLink>
          );
        })}
    </TabBar>
  );
}
