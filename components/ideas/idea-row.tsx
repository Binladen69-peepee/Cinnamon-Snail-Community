import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { IdeaCategoryBadge, IdeaStatusBadge } from "@/components/ideas/idea-badges";
import { IdeaVoteButton } from "@/components/ideas/idea-vote-button";
import { formatShortTime } from "@/lib/community/format-count";
import type { IdeaListItem } from "@/lib/ideas/queries";

/**
 * One idea on the board, Reddit-style: the vote down the left edge, then the
 * title, a line of what it says, and the facts (status, kind, replies, who,
 * when). Rows sit in one card with dividers, not a card each.
 */
export function IdeaRow({ idea }: { idea: IdeaListItem }) {
  const replies = `${idea.commentCount} ${idea.commentCount === 1 ? "reply" : "replies"}`;
  return (
    <li className="flex gap-3 px-3 py-3.5 sm:gap-4 sm:px-5">
      <IdeaVoteButton
        ideaId={idea.id}
        title={idea.title}
        score={idea.score}
        voted={idea.voted}
        block={idea.voteBlock}
      />
      <div className="min-w-0 flex-1">
        <h2 className="text-title font-semibold leading-snug text-foreground">
          <Link
            href={`/ideas/${idea.id}`}
            className="wrap-break-word text-foreground no-underline transition hover:text-brand-strong"
          >
            {idea.title}
          </Link>
        </h2>
        {idea.excerpt ? (
          <p className="mt-0.5 line-clamp-2 text-body text-foreground-muted">{idea.excerpt}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-caption text-foreground-muted">
          <IdeaStatusBadge status={idea.status} />
          <IdeaCategoryBadge category={idea.category} />
          <Link
            href={`/ideas/${idea.id}#replies`}
            className="inline-flex items-center gap-1 tabular-nums text-foreground-muted no-underline transition hover:text-foreground"
            aria-label={`${replies} on “${idea.title}”`}
          >
            <MessageSquare className="size-3.5" aria-hidden />
            {idea.commentCount}
          </Link>
          <span className="min-w-0 truncate">
            by{" "}
            <Link
              href={`/members/${idea.author.handle}`}
              className="font-medium text-foreground no-underline hover:underline"
            >
              {idea.author.name}
            </Link>
          </span>
          <time dateTime={idea.publishedAt.toISOString()} className="tabular-nums">
            {formatShortTime(idea.publishedAt)}
          </time>
        </div>
      </div>
    </li>
  );
}
