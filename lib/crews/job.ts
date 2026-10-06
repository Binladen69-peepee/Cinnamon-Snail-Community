import "server-only";
import { backfillSamcartStarts, type SamcartStartResult } from "@/lib/crews/samcart-start";
import { syncKitSurveyTraits, type KitSurveySyncResult } from "@/lib/crews/kit-survey";
import { recomputeCrews, type RecomputeResult } from "@/lib/crews/recompute";

/**
 * The daily crews pass, and the console's "Recompute now": first learn what
 * can be learned (SamCart start dates, then Kit survey answers, each a bounded
 * batch), then rebuild the automatic crews from it.
 *
 * Each step stands alone. Kit being down does not stop the recompute, and the
 * recompute still runs with whatever answers were already stored. The time
 * budgets add up to well inside the sixty seconds a job route gets.
 */
export type CrewsJobResult = {
  samcart: SamcartStartResult | { error: string };
  survey: KitSurveySyncResult | { error: string };
  recompute: RecomputeResult | { error: string };
};

function failure(error: unknown) {
  console.error("[crews] step failed", error);
  return { error: error instanceof Error ? error.message.slice(0, 300) : "failed" };
}

export async function runCrewsJob(
  options: { trigger: "cron" | "manual"; actorId?: string | null; now?: Date } = { trigger: "cron" },
): Promise<CrewsJobResult> {
  const common = { trigger: options.trigger, actorId: options.actorId ?? null };

  const samcart = await backfillSamcartStarts({ ...common, budgetMs: 10_000, limit: 25 }).catch(
    failure,
  );
  const survey = await syncKitSurveyTraits({ ...common, budgetMs: 25_000, limit: 45 }).catch(
    failure,
  );
  const recompute = await recomputeCrews({ ...common, now: options.now }).catch(failure);

  return { samcart, survey, recompute };
}
