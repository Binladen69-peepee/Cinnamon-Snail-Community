import { Sparkles } from "lucide-react";
import type { ChallengeCard } from "@/lib/challenges";
import { ProgressBar } from "@/components/app/ui";

/**
 * A member's own progress. Never anybody else's, and never a position.
 *
 * The bar fills towards the target, not the number of prompts, because the
 * target is lower on purpose; the count under it says the same thing in
 * words, so the bar is never the only carrier. It turns to the success tone
 * once the challenge is finished.
 *
 * Used by the challenge cards and the challenge page. It lived in the index
 * route file and was imported from there, which made a page a component
 * library.
 */
export function ChallengeProgress({
  card,
  size = "sm",
}: {
  card: ChallengeCard;
  size?: "sm" | "md";
}) {
  const done = Math.min(card.progress, card.targetCount);
  return (
    <div className="flex flex-col gap-1.5">
      <ProgressBar
        value={done}
        max={card.targetCount}
        label="Your progress"
        size={size}
        tone={card.completed ? "success" : "brand"}
      />
      <p className="flex items-center gap-1 text-caption tabular-nums text-foreground-muted">
        {card.completed ? (
          <Sparkles className="size-3.5 text-success" aria-hidden />
        ) : null}
        {card.progress} done
        {card.completed ? " — finished" : ` of ${card.targetCount}`}
      </p>
    </div>
  );
}
