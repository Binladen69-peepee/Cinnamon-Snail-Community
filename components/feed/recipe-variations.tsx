"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChefHat, Star } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import {
  submitVariationAction,
  toggleTestedAction,
  toggleVariationReactionAction,
  type VariationResult,
} from "@/app/(member)/posts/[id]/variation-actions";
import type { VariationView } from "@/lib/recipes/variations";

/**
 * Variations under a recipe — BUILD.md §18.
 *
 * Approved ones are public; a member also sees their own while it waits for
 * review, with the reason if it was turned down, so submitting never feels
 * like shouting into a void.
 */
export function RecipeVariations({
  recipeId,
  postId,
  variations,
}: {
  recipeId: string;
  postId: string;
  variations: VariationView[];
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const run = (action: (f: FormData) => Promise<VariationResult>, form: FormData, good: string) =>
    start(async () => {
      const result = await action(form);
      if (result.ok) toast.success(result.detail ?? good);
      else toast.danger(result.error);
    });

  const mine = variations.find((variation) => variation.isAuthor);
  const field =
    "w-full rounded-card border border-field-border bg-default px-3 py-2 text-[14px] text-foreground";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[1.1rem] font-bold text-foreground">
          Variations{variations.length ? ` (${variations.filter((v) => v.status === "approved").length})` : ""}
        </h2>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="vu-btn vu-btn-secondary inline-flex h-9 items-center gap-1.5 px-3.5 text-[13px]"
          >
            <ChefHat className="size-3.5" aria-hidden />
            {mine ? "Edit your variation" : "Share your version"}
          </button>
        ) : null}
      </div>

      {open ? (
        <form
          className="space-y-2 rounded-card border border-border bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            form.set("recipeId", recipeId);
            form.set("postId", postId);
            run(submitVariationAction, form, "Sent for review.");
          }}
        >
          <p className="text-[13px] text-foreground-muted">
            What did you change, and why? A moderator reads it before it goes up.
          </p>
          <textarea
            name="authorNote"
            required
            rows={3}
            maxLength={2000}
            defaultValue={mine?.authorNote ?? ""}
            placeholder="I swapped the cashews for sunflower seeds and roasted them first."
            className={field}
          />
          <input
            name="reason"
            maxLength={500}
            defaultValue={mine?.reason ?? ""}
            placeholder="Why — nut allergy, what was in the cupboard, cheaper…"
            className={field}
          />
          <textarea
            name="ingredients"
            rows={3}
            maxLength={4000}
            defaultValue={mine?.ingredients.join("\n") ?? ""}
            placeholder="Adjusted ingredients, one per line (optional)"
            className={field}
          />
          <input
            name="photoUrl"
            maxLength={500}
            defaultValue={mine?.photoUrl ?? ""}
            placeholder="Photo URL (optional)"
            className={field}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="vu-btn vu-btn-primary inline-flex h-10 items-center px-4 text-[14px] disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send for review"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="vu-btn vu-btn-secondary inline-flex h-10 items-center px-4 text-[14px]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {variations.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-surface px-4 py-6 text-center text-[13.5px] text-foreground-muted">
          No variations yet. If you cooked this differently, say how.
        </p>
      ) : (
        <ul className="space-y-3">
          {variations.map((variation) => (
            <li
              key={variation.id}
              className="space-y-2 rounded-card border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Avatar name={variation.author.name ?? variation.author.handle} src={variation.author.avatarUrl} size="sm" />
                <span className="text-[13px] font-semibold text-foreground">
                  @{variation.author.handle}
                </span>
                {variation.featured ? (
                  <span className="inline-flex items-center gap-1 rounded-chip bg-brand-fill px-2 py-0.5 text-[11px] font-bold text-brand-fill-foreground">
                    <Star className="size-3" aria-hidden />
                    Featured
                  </span>
                ) : null}
                {variation.status !== "approved" ? (
                  <span className="rounded-chip bg-default px-2 py-0.5 text-[11px] font-bold text-foreground-muted">
                    {variation.status === "pending" ? "Waiting for review" : "Not published"}
                  </span>
                ) : null}
                {variation.testedBy > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11.5px] tabular-nums text-foreground-muted">
                    <CheckCircle2 className="size-3" aria-hidden />
                    Tested by {variation.testedBy}
                  </span>
                ) : null}
              </div>

              <p className="text-[14px] leading-snug text-foreground">{variation.authorNote}</p>
              {variation.reason ? (
                <p className="text-[13px] text-foreground-muted">Why: {variation.reason}</p>
              ) : null}
              {variation.ingredients.length > 0 ? (
                <ul className="list-inside list-disc text-[13px] text-foreground-muted">
                  {variation.ingredients.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {variation.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={variation.photoUrl} alt="" loading="lazy" className="max-h-72 w-full rounded-card object-cover" />
              ) : null}

              {variation.status === "rejected" && variation.rejectionReason ? (
                <p className="text-[12.5px] text-danger">{variation.rejectionReason}</p>
              ) : null}

              {variation.status === "approved" ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      const form = new FormData();
                      form.set("variationId", variation.id);
                      form.set("postId", postId);
                      run(toggleVariationReactionAction, form, "Thanks.");
                    }}
                    className={`vu-btn ${variation.reactedByViewer ? "vu-btn-primary" : "vu-btn-secondary"} inline-flex h-8 items-center gap-1.5 px-3 text-[12.5px]`}
                  >
                    👏 {variation.reactions}
                  </button>
                  {!variation.isAuthor ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        const form = new FormData();
                        form.set("variationId", variation.id);
                        form.set("postId", postId);
                        run(toggleTestedAction, form, "Thanks.");
                      }}
                      className={`vu-btn ${variation.testedByViewer ? "vu-btn-primary" : "vu-btn-secondary"} inline-flex h-8 items-center gap-1.5 px-3 text-[12.5px]`}
                    >
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      {variation.testedByViewer ? "I cooked this" : "I cooked this too"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
