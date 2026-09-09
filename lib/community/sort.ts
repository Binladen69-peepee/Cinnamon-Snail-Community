export type FeedSort = "hot" | "new" | "top" | "rising";

export const FEED_SORTS: { value: FeedSort; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "new", label: "New" },
  { value: "top", label: "Top" },
  { value: "rising", label: "Rising" },
];

export function parseFeedSort(value: string | string[] | undefined): FeedSort {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "new" || raw === "top" || raw === "rising" || raw === "hot") {
    return raw;
  }
  return "hot";
}

/** Reddit-style hot rank: log-magnitude of score plus age. */
export function hotRank(score: number, createdAt: Date, now = new Date()): number {
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = Math.sign(score);
  const ageHours = Math.max((now.getTime() - createdAt.getTime()) / 3_600_000, 0);
  return sign * order - ageHours / 12.5;
}

/** Rising favors recent posts that already have a score. */
export function risingRank(score: number, createdAt: Date, now = new Date()): number {
  const ageHours = Math.max((now.getTime() - createdAt.getTime()) / 3_600_000, 0.25);
  if (ageHours > 48) return Number.NEGATIVE_INFINITY;
  return score / Math.pow(ageHours + 2, 1.5);
}

type Rankable = {
  score: number;
  publishedAt: Date | null;
  createdAt: Date;
  pinnedAt: Date | null;
};

export function sortByFeed<T extends Rankable>(items: T[], sort: FeedSort, now = new Date()): T[] {
  const dated = (item: T) => item.publishedAt ?? item.createdAt;
  return [...items].sort((a, b) => {
    const pin = Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt));
    if (pin !== 0) return pin;
    if (sort === "new") return dated(b).getTime() - dated(a).getTime();
    if (sort === "top") {
      if (b.score !== a.score) return b.score - a.score;
      return dated(b).getTime() - dated(a).getTime();
    }
    if (sort === "rising") {
      return risingRank(b.score, dated(b), now) - risingRank(a.score, dated(a), now);
    }
    return hotRank(b.score, dated(b), now) - hotRank(a.score, dated(a), now);
  });
}

export type NestableComment = {
  id: string;
  parentId: string | null;
  score: number;
  createdAt: Date;
};

export type NestedComment<T extends NestableComment> = T & {
  replies: NestedComment<T>[];
};

export function nestComments<T extends NestableComment>(
  comments: T[],
  sort: FeedSort,
): NestedComment<T>[] {
  type Node = NestedComment<T>;
  const nodes = new Map<string, Node>();
  for (const comment of comments) {
    nodes.set(comment.id, { ...comment, replies: [] });
  }
  const roots: Node[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  const rankList = (list: Node[]): Node[] =>
    sortByFeed(
      list.map((item) => ({ ...item, publishedAt: item.createdAt, pinnedAt: null })),
      sort,
    ).map((item) => ({
      ...item,
      replies: rankList(item.replies),
    }));
  return rankList(roots);
}
