"use client";

import { useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { reviewPostAction } from "@/app/(member)/community-actions";
import { toast } from "@/components/ui/toast";

/** Approve or decline, with the result said out loud either way. */
export function ReviewDecision({ postId }: { postId: string }) {
  const [pending, startTransition] = useTransition();

  function decide(decision: "approve" | "decline") {
    const data = new FormData();
    data.set("postId", postId);
    data.set("decision", decision);
    startTransition(async () => {
      const result = await reviewPostAction(data);
      if (result.ok) {
        toast.success(decision === "approve" ? "Post published." : "Post declined.");
      } else {
        toast.danger(result.error);
      }
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("approve")}
        className="vu-btn vu-btn-primary inline-flex h-11 min-w-[7rem] items-center justify-center gap-1.5 px-4 text-[13.5px]"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Check className="size-4" aria-hidden />
        )}
        Publish
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("decline")}
        className="vu-btn inline-flex h-11 min-w-[7rem] items-center justify-center gap-1.5 px-4 text-[13.5px]"
      >
        <X className="size-4" aria-hidden />
        Decline
      </button>
    </div>
  );
}
