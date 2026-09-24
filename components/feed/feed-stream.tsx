"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PostCard } from "@/components/feed/post-card";
import type { Density } from "@/components/feed/feed-toolbar";
import {
  reviveFeedCard,
  type FeedCardPost,
  type RevivedFeedCard,
} from "@/lib/community/feed-card";

/**
 * The feed, and the rest of the feed.
 *
 * The first page arrives with the document, server-rendered, so the feed is
 * readable and shareable before any JavaScript runs. This component only adds
 * what comes after: it watches a sentinel below the last post and asks for the
 * next page when it approaches.
 *
 * Three things keep that honest.
 *
 * A request in flight blocks another, so a fast scroll cannot fire six
 * overlapping fetches for the same cursor. Ids already on screen are skipped,
 * so a post that moved between pages is not rendered twice. And there is a
 * real button underneath, because an observer that never fires — no
 * JavaScript, a browser that does not support it, a reader using the keyboard
 * — must not be the only way to reach the second page.
 *
 * Changing the sort is a different feed rather than more of this one, so the
 * caller gives this component a key that includes the sort. Remounting resets
 * the accumulated pages; synchronising them back to the props in an effect
 * would render the old feed once before correcting itself.
 */
export function FeedStream({
  initialPosts,
  initialCursor,
  sort,
  spaceSlug,
  viewer,
  density,
  canPin,
  emptyState,
}: {
  initialPosts: FeedCardPost[];
  initialCursor: string | null;
  sort: string;
  spaceSlug?: string;
  viewer: { name: string; avatar: string | null; handle: string };
  density: Density;
  canPin: boolean;
  emptyState: React.ReactNode;
}) {
  const [posts, setPosts] = useState<RevivedFeedCard[]>(() =>
    initialPosts.map(reviveFeedCard),
  );
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seen = useRef(new Set(initialPosts.map((post) => post.id)));
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ sort, cursor });
      if (spaceSlug) params.set("space", spaceSlug);
      const response = await fetch(`/api/community/feed?${params}`);
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as {
        posts: FeedCardPost[];
        nextCursor: string | null;
      };
      const fresh = data.posts.filter((post) => !seen.current.has(post.id));
      for (const post of fresh) seen.current.add(post.id);
      setPosts((current) => [...current, ...fresh.map(reviveFeedCard)]);
      setCursor(data.nextCursor);
    } catch {
      // Keep the cursor: the reader can press the button to try the same page
      // again rather than losing their place in the feed.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, sort, spaceSlug]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      // Start fetching before the reader reaches the bottom, so the next posts
      // are usually already there when they arrive.
      { rootMargin: "800px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  if (posts.length === 0) return <>{emptyState}</>;

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          viewer={viewer}
          density={density}
          canPin={canPin}
        />
      ))}

      <div ref={sentinel} aria-hidden className="h-px" />

      <div className="py-4 text-center" aria-live="polite">
        {loading ? (
          <span className="inline-flex items-center gap-2 text-[13px] text-foreground-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading more posts
          </span>
        ) : failed ? (
          <div className="space-y-2">
            <p className="text-[13px] text-foreground-muted">
              That did not load. Your place in the feed is safe.
            </p>
            <button type="button" onClick={() => void loadMore()} className="vu-btn">
              Try again
            </button>
          </div>
        ) : cursor ? (
          <button type="button" onClick={() => void loadMore()} className="vu-btn">
            Load more posts
          </button>
        ) : (
          <p className="text-[13px] text-foreground-muted">
            That is everything for now.
          </p>
        )}
      </div>
    </div>
  );
}
