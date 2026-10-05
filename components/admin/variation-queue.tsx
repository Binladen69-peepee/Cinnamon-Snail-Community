"use client";

import { useTransition } from "react";
import { Check, Star, X } from "lucide-react";
import { Button } from "@/components/app/ui";
import { toast } from "@/components/ui/toast";
import {
  reviewVariationAction,
  setFeaturedAction,
  type Result,
} from "@/app/admin/variations/actions";

/** Approve, turn down, or feature a variation. */
export function VariationControls({
  variationId,
  status,
  featured,
}: {
  variationId: string;
  status: string;
  featured: boolean;
}) {
  const [pending, start] = useTransition();
  const run = (action: (f: FormData) => Promise<Result>, form: FormData, good: string) =>
    start(async () => {
      const result = await action(form);
      if (result.ok) toast.success(result.detail ?? good);
      else toast.danger(result.error);
    });

  const form = (extra: Record<string, string>) => {
    const data = new FormData();
    data.set("variationId", variationId);
    for (const [key, value] of Object.entries(extra)) data.set(key, value);
    return data;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "approved" ? (
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={() => run(reviewVariationAction, form({ approve: "1" }), "Published.")}
        >
          <Check className="size-4" aria-hidden />
          Publish
        </Button>
      ) : null}
      {status !== "rejected" ? (
        <Button
          type="button"
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() =>
            run(
              reviewVariationAction,
              form({ approve: "0", reason: "A moderator did not publish this." }),
              "Turned down.",
            )
          }
        >
          <X className="size-4" aria-hidden />
          Turn down
        </Button>
      ) : null}
      {status === "approved" ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(setFeaturedAction, form({ featured: featured ? "0" : "1" }), "Saved.")}
        >
          <Star className="size-4" aria-hidden />
          {featured ? "Unfeature" : "Feature"}
        </Button>
      ) : null}
    </div>
  );
}
