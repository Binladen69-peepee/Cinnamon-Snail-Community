"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/app/ui";
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
 * readable before any JavaScript runs. This component adds what comes after:
 * it watches a sentinel below the last post and asks for the next page when it
 * approaches, with a real button underneath for when the observer cannot fire.
 *
 * The first page always comes from the props. It used to be copied into state
 * once, so when the server re-rendered — after the member posted, say — the
 * new page was ignored: the post they had just written did not appear, and
 * every card kept the data it had on arrival. Pages loaded by scrolling are
 * kept separately and appended, and anything already on screen (including
 * the pinned section above, via `alsoShown`) is never drawn twice.
 *
 * Changing the sort is a different feed rather than more of this one, so the
 * caller gives this component a key that includes the sort.
 */
export function FeedStream({
  initialPosts,
  initialCursor,
  sort,
  spaceSlug,
  kind,
  viewer,
  density,
  canPin,
  emptyState,
  alsoShown,
}: {
  initialPosts: FeedCardPost[];
  initialCursor: string | null;
  sort: string;
  /** Only for a single room's feed; the Kitchen Table sends none. */
  spaceSlug?: string;
  kind?: "video";
  viewer: { name: string; avatar: string | null; handle: string };
  density: Density;
  canPin: boolean;
  emptyState: React.ReactNode;
  /** Ids already on the page above this stream (pins, announcements). */
  alsoShown?: string[];
}) {
  const first = useMemo(() => initialPosts.map(reviveFeedCard), [initialPosts]);
  const [extra, setExtra] = useState<RevivedFeedCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [paged, setPaged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // When the server sends a new first page after the reader has scrolled, a
  // post that slid off the end of it would otherwise fall between the new
  // first page and the pages already loaded. Keep it, after the new page.
  const [retained, setRetained] = useState<RevivedFeedCard[]>([]);
  const [lastFirst, setLastFirst] = useState(first);
  if (lastFirst !== first) {
    const nowFirst = new Set(first.map((post) => post.id));
    const dropped = lastFirst.filter((post) => !nowFirst.has(post.id));
    setRetained((current) => [
      ...dropped,
      ...current.filter((post) => !nowFirst.has(post.id) && !dropped.some((d) => d.id === post.id)),
    ]);
    setLastFirst(first);
  }

  const posts = useMemo(() => {
    const seen = new Set(alsoShown ?? []);
    const out: RevivedFeedCard[] = [];
    for (const post of [...first, ...(paged ? retained : []), ...extra]) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      out.push(post);
    }
    return out;
  }, [first, retained, extra, paged, alsoShown]);

  const nextCursor = paged ? cursor : initialCursor;

  const loadMore = useCallback(async () => {
    if (loading || !nextCursor) return;
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ sort, cursor: nextCursor });
      if (spaceSlug) params.set("space", spaceSlug);
      if (kind) params.set("kind", kind);
      const response = await fetch(`/api/community/feed?${params}`);
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as {
        posts: FeedCardPost[];
        nextCursor: string | null;
      };
      setExtra((current) => [...current, ...data.posts.map(reviveFeedCard)]);
      setCursor(data.nextCursor);
      setPaged(true);
    } catch {
      // Keep the cursor: the reader can press the button to try the same page
      // again rather than losing their place in the feed.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [kind, loading, nextCursor, sort, spaceSlug]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !nextCursor || failed) return;
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
  }, [failed, loadMore, nextCursor]);

  if (posts.length === 0 && !nextCursor) return <>{emptyState}</>;

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

      <div className="flex flex-col items-center py-4 text-center" aria-live="polite">
        {loading ? (
          <span className="inline-flex h-8 items-center gap-2 text-label text-foreground-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading more posts
          </span>
        ) : failed ? (
          <div className="flex flex-col items-center gap-2.5">
            <p className="text-label text-foreground-muted">
              That did not load. Your place in the feed is safe.
            </p>
            <Button size="sm" onClick={() => void loadMore()}>
              <RotateCw className="size-4" aria-hidden />
              Try again
            </Button>
          </div>
        ) : nextCursor ? (
          <Button size="sm" onClick={() => void loadMore()}>
            Load more posts
          </Button>
        ) : posts.length > 0 ? (
          <p className="text-caption text-foreground-muted">That is everything for now.</p>
        ) : null}
      </div>
    </div>
  );
}
