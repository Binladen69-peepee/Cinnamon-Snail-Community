import { PenLine, Soup } from "lucide-react";
import type { FeedSort } from "@/lib/community/sort";
import { ButtonLink, EmptyState } from "@/components/app/ui";

/**
 * The empty Kitchen Table.
 *
 * Every member sits at the Kitchen Table, so "join a room first" is no longer
 * a reason for an empty feed (DEC-078). What is left is a sort that is
 * narrower than the community, or a community that has not said anything yet,
 * and the answer to both is the same: try another order, or start it.
 */
export function FeedEmpty({
  sort,
}: {
  sort: FeedSort;
  /** Retired: there are no rooms to join. Accepted so callers compile. */
  hasSpaces?: boolean;
}) {
  return (
    <EmptyState
      icon={<Soup />}
      title={
        sort === "top"
          ? "Nothing has been voted up this week"
          : sort === "new"
            ? "Nothing new yet"
            : "The table is quiet"
      }
      description={
        sort === "new"
          ? "Be the first to put something on the table today."
          : "Try another order, or start the conversation yourself."
      }
      action={
        <ButtonLink href="/compose" variant="primary">
          <PenLine className="size-4" aria-hidden />
          Write a post
        </ButtonLink>
      }
    />
  );
}
