"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, MessageSquare } from "lucide-react";
import { similarIdeasAction } from "@/app/(member)/ideas/actions";
import { IdeaStatusBadge } from "@/components/ideas/idea-badges";
import { IdeaVoteButton } from "@/components/ideas/idea-vote-button";
import type { SimilarIdea } from "@/lib/ideas/queries";
import { normalizeIdeaTitle } from "@/lib/ideas/similarity";

/** Below this many characters a title is still being started, not searched. */
const MIN_QUERY = 4;
const DEBOUNCE_MS = 400;

/**
 * "Already on the board?" — the duplicate guard members actually see.
 *
 * Runs while the title is typed, a moment after the typing stops, and lists
 * the ideas that look like the same request with an upvote right there, so
 * the easy thing to do is add a vote rather than a second copy. Each idea
 * opens in a new tab, so reading one does not lose what was typed.
 */
export function SimilarIdeas({
  title,
  excludeId,
}: {
  title: string;
  excludeId?: string;
}) {
  const query = normalizeIdeaTitle(title);
  const searching = query.length >= MIN_QUERY;
  // Kept with the query it answers, so a slow answer to an old query is
  // never shown against a newer title.
  const [result, setResult] = useState<{ query: string; ideas: SimilarIdea[] } | null>(null);

  useEffect(() => {
    if (query.length < MIN_QUERY) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const ideas = await similarIdeasAction(query, excludeId ?? null);
        if (!cancelled) setResult({ query, ideas });
      } catch {
        // The form works without suggestions.
        if (!cancelled) setResult({ query, ideas: [] });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, excludeId]);

  if (!searching) return null;
  const current = result?.query === query;
  const ideas = result?.ideas ?? [];

  function settle(id: string, state: { voted: boolean; score: number }) {
    setResult((previous) =>
      previous
        ? {
            ...previous,
            ideas: previous.ideas.map((idea) => (idea.id === id ? { ...idea, ...state } : idea)),
          }
        : previous,
    );
  }

  // Nothing to show is shown as nothing: a "checking…" line that flickers on
  // every keystroke is noise next to a field someone is typing into.
  if (ideas.length === 0) return null;

  return (
    <section
      aria-label="Similar ideas already on the board"
      aria-live="polite"
      className="rounded-ctl bg-surface-muted p-3 sm:p-4"
    >
      <h3 className="text-label font-semibold text-foreground">Already on the board?</h3>
      <p className="mt-0.5 text-caption text-foreground-muted">
        If one of these is what you mean, upvote it instead of posting it again. Votes in one
        place count for more.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {ideas.map((idea) => (
          <li
            key={idea.id}
            className="flex items-start gap-3 rounded-ctl bg-surface px-3 py-2.5 shadow-e1"
          >
            <IdeaVoteButton
              ideaId={idea.id}
              title={idea.title}
              score={idea.score}
              voted={idea.voted}
              block={idea.voteBlock}
              size="sm"
              onSettled={(state) => settle(idea.id, state)}
            />
            <div className="min-w-0 flex-1">
              <a
                href={`/ideas/${idea.id}`}
                target="_blank"
                rel="noopener"
                className="inline-flex max-w-full items-start gap-1 text-body font-medium leading-snug text-foreground no-underline hover:text-brand-strong hover:underline"
              >
                <span className="min-w-0 wrap-break-word">{idea.title}</span>
                <ExternalLink className="mt-1 size-3 shrink-0 text-foreground-muted" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-foreground-muted">
                <IdeaStatusBadge status={idea.status} />
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <MessageSquare className="size-3" aria-hidden />
                  {idea.commentCount}
                  <span className="sr-only">{idea.commentCount === 1 ? "reply" : "replies"}</span>
                </span>
              </p>
            </div>
          </li>
        ))}
      </ul>
      {!current ? (
        <p className="mt-2 flex items-center gap-2 text-caption text-foreground-muted" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Updating…
        </p>
      ) : null}
    </section>
  );
}
