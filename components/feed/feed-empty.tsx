import Link from "next/link";
import { Compass, PenLine, Soup } from "lucide-react";
import type { FeedSort } from "@/lib/community/sort";

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
      <div className="rounded-card border border-border bg-surface px-6 py-10 text-center">
        <Compass className="mx-auto size-6 text-brand" aria-hidden />
        <p className="mt-3 text-[16px] font-bold text-foreground">
          Your feed is empty because you have not joined a room yet
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-relaxed text-foreground-muted">
          Every post lives in a space. Join a couple and this fills up with what
          people are cooking.
        </p>
        <Link
          href="/discover?tab=spaces"
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-forest px-4 text-[13.5px] font-bold text-paper no-underline transition hover:bg-deep-forest dark:bg-brand dark:text-on-brand"
        >
          <Compass className="size-4" aria-hidden />
          Find your kitchens
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface px-6 py-10 text-center">
      <Soup className="mx-auto size-6 text-brand" aria-hidden />
      <p className="mt-3 text-[16px] font-bold text-foreground">
        {sort === "top"
          ? "Nothing has been voted up yet"
          : sort === "rising"
            ? "Nothing is climbing right now"
            : "Nothing here yet"}
      </p>
      <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-relaxed text-foreground-muted">
        {sort === "new"
          ? "Be the first to put something on the table today."
          : "Try Latest, or start the conversation yourself."}
      </p>
      <Link
        href="/compose"
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-forest px-4 text-[13.5px] font-bold text-paper no-underline transition hover:bg-deep-forest dark:bg-brand dark:text-on-brand"
      >
        <PenLine className="size-4" aria-hidden />
        Write a post
      </Link>
    </div>
  );
}
