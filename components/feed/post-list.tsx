"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/app/ui";
import { PostCard } from "@/components/feed/post-card";
import type { Density } from "@/components/feed/feed-toolbar";
import { reviveFeedCard, type FeedCardPost } from "@/lib/community/feed-card";

/**
 * A short, fixed list of posts above the feed: the reader's pins, or the
 * team's announcements.
 *
 * Pins can add up — every save made before pins existed is one — so the list
 * can start with only the newest few and keep the rest one tap away, rather
 * than pushing the feed off the first screen.
 */
export function PostList({
  posts,
  viewer,
  density,
  canPin,
  label,
  pinnedMark = false,
  initiallyShown,
}: {
  posts: FeedCardPost[];
  viewer: { name: string; avatar: string | null; handle: string };
  density: Density;
  canPin: boolean;
  /** What the list is, for assistive technology. */
  label: string;
  /** Mark each card "Pinned" (the reader's own pins). */
  pinnedMark?: boolean;
  /** Show only this many until the reader asks for the rest. */
  initiallyShown?: number;
}) {
  const revived = useMemo(() => posts.map(reviveFeedCard), [posts]);
  const [showAll, setShowAll] = useState(false);

  if (revived.length === 0) return null;

  const visible =
    showAll || !initiallyShown ? revived : revived.slice(0, initiallyShown);
  const hidden = revived.length - visible.length;

  return (
    <section aria-label={label} className="flex flex-col gap-3">
      {visible.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          viewer={viewer}
          density={density}
          canPin={canPin}
          pinnedMark={pinnedMark}
        />
      ))}
      {hidden > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll(true)}
          aria-expanded={false}
          className="self-center"
        >
          <ChevronDown className="size-4" aria-hidden />
          Show {hidden} more pinned {hidden === 1 ? "post" : "posts"}
        </Button>
      ) : null}
    </section>
  );
}
