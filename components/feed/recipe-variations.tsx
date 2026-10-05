"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, ChefHat, Star } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Button, Card, EmptyState, fieldClass } from "@/components/app/ui";
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
 *
 * One card: the heading and its action, the form when it is open, then the
 * variations as rows.
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
  const field = fieldClass();
  const area = fieldClass({ multiline: true, className: "block min-h-20 resize-y" });

  return (
    <Card padding="none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-2 text-body font-semibold text-foreground">
          <ChefHat className="size-4 text-foreground-muted" aria-hidden />
          Variations{variations.length ? ` (${variations.filter((v) => v.status === "approved").length})` : ""}
        </h2>
        {!open ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <ChefHat className="size-3.5" aria-hidden />
            {mine ? "Edit your variation" : "Share your version"}
          </Button>
        ) : null}
      </div>

      {open ? (
        <form
          className="flex flex-col gap-3 border-b border-separator px-4 py-4 sm:px-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            form.set("recipeId", recipeId);
            form.set("postId", postId);
            run(submitVariationAction, form, "Sent for review.");
          }}
        >
          <p className="text-label text-foreground-muted">
            What did you change, and why? A moderator reads it before it goes up.
          </p>
          <textarea
            name="authorNote"
            required
            rows={3}
            maxLength={2000}
            defaultValue={mine?.authorNote ?? ""}
            placeholder="I swapped the cashews for sunflower seeds and roasted them first."
            aria-label="What you changed"
            className={area}
          />
          <input
            name="reason"
            maxLength={500}
            defaultValue={mine?.reason ?? ""}
            placeholder="Why — nut allergy, what was in the cupboard, cheaper…"
            aria-label="Why"
            className={field}
          />
          <textarea
            name="ingredients"
            rows={3}
            maxLength={4000}
            defaultValue={mine?.ingredients.join("\n") ?? ""}
            placeholder="Adjusted ingredients, one per line (optional)"
            aria-label="Adjusted ingredients"
            className={area}
          />
          <input
            name="photoUrl"
            maxLength={500}
            defaultValue={mine?.photoUrl ?? ""}
            placeholder="Photo URL (optional)"
            aria-label="Photo URL"
            className={field}
          />
          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Sending…" : "Send for review"}
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {variations.length === 0 ? (
        <EmptyState
          size="sm"
          bordered={false}
          icon={<ChefHat />}
          title="No variations yet"
          description="If you cooked this differently, say how."
        />
      ) : (
        <ul className="divide-y divide-separator">
          {variations.map((variation) => (
            <li key={variation.id} className="flex flex-col gap-2 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <Avatar name={variation.author.name ?? variation.author.handle} src={variation.author.avatarUrl} size="sm" />
                <span className="text-label font-semibold text-foreground">
                  @{variation.author.handle}
                </span>
                {variation.featured ? (
                  <Badge tone="solid" icon={<Star aria-hidden />}>
                    Featured
                  </Badge>
                ) : null}
                {variation.status !== "approved" ? (
                  <Badge tone={variation.status === "pending" ? "warning" : "neutral"}>
                    {variation.status === "pending" ? "Waiting for review" : "Not published"}
                  </Badge>
                ) : null}
                {variation.testedBy > 0 ? (
                  <span className="inline-flex items-center gap-1 text-caption tabular-nums text-foreground-muted">
                    <CheckCircle2 className="size-3" aria-hidden />
                    Tested by {variation.testedBy}
                  </span>
                ) : null}
              </div>

              <p className="text-body leading-relaxed text-foreground">{variation.authorNote}</p>
              {variation.reason ? (
                <p className="text-label text-foreground-muted">Why: {variation.reason}</p>
              ) : null}
              {variation.ingredients.length > 0 ? (
                <ul className="list-inside list-disc text-label text-foreground-muted">
                  {variation.ingredients.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {variation.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={variation.photoUrl} alt="" loading="lazy" className="max-h-72 w-full rounded-ctl bg-surface-muted object-cover" />
              ) : null}

              {variation.status === "rejected" && variation.rejectionReason ? (
                <p className="text-caption font-medium text-danger">{variation.rejectionReason}</p>
              ) : null}

              {variation.status === "approved" ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant={variation.reactedByViewer ? "primary" : "secondary"}
                    disabled={pending}
                    onClick={() => {
                      const form = new FormData();
                      form.set("variationId", variation.id);
                      form.set("postId", postId);
                      run(toggleVariationReactionAction, form, "Thanks.");
                    }}
                    className="tabular-nums"
                  >
                    👏 {variation.reactions}
                  </Button>
                  {!variation.isAuthor ? (
                    <Button
                      size="sm"
                      variant={variation.testedByViewer ? "primary" : "secondary"}
                      disabled={pending}
                      onClick={() => {
                        const form = new FormData();
                        form.set("variationId", variation.id);
                        form.set("postId", postId);
                        run(toggleTestedAction, form, "Thanks.");
                      }}
                    >
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      {variation.testedByViewer ? "I cooked this" : "I cooked this too"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
