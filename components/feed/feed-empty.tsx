import { Compass, PenLine, Soup } from "lucide-react";
import type { FeedSort } from "@/lib/community/sort";
import { ButtonLink, EmptyState } from "@/components/app/ui";

/**
 * The empty feed.
 *
 * Two genuinely different situations, and conflating them is what makes empty
 * states useless. Someone in no spaces has nothing to read because they have
 * not joined anything — the fix is to go and join. Someone in spaces with an
 * empty sort has nothing to read because the sort is narrow — the fix is a
 * different sort, or writing the first post themselves.
 */
export function FeedEmpty({
  sort,
  hasSpaces,
}: {
  sort: FeedSort;
  hasSpaces: boolean;
}) {
  if (!hasSpaces) {
    return (
      <EmptyState
        icon={<Compass />}
        title="Your feed is empty because you have not joined a room yet"
        description="Every post lives in a space. Join a couple and this fills up with what people are cooking."
        action={
          <ButtonLink href="/spaces" variant="primary">
            <Compass className="size-4" aria-hidden />
            Find your kitchens
          </ButtonLink>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={<Soup />}
      title={
        sort === "top"
          ? "Nothing has been voted up this week"
          : sort === "new"
            ? "Nothing new yet"
            : "Nothing here yet"
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
