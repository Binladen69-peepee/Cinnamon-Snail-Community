"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { reviewPostAction } from "@/app/(member)/community-actions";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/app/ui";

/** Approve or decline, with the result said out loud either way. */
export function ReviewDecision({ postId }: { postId: string }) {
  const [pending, startTransition] = useTransition();
  // Which button was pressed, so the spinner shows on that one. Both stay
  // disabled while either is in flight: a post gets one decision.
  const [choice, setChoice] = useState<"approve" | "decline" | null>(null);

  function decide(decision: "approve" | "decline") {
    const data = new FormData();
    data.set("postId", postId);
    data.set("decision", decision);
    setChoice(decision);
    startTransition(async () => {
      const result = await reviewPostAction(data);
      if (result.ok) {
        toast.success(decision === "approve" ? "Post published." : "Post declined.");
      } else {
        toast.danger(result.error);
      }
    });
  }

  const spinning = (decision: "approve" | "decline") => pending && choice === decision;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button variant="primary" disabled={pending} onClick={() => decide("approve")}>
        {spinning("approve") ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Check className="size-4" aria-hidden />
        )}
        Publish
      </Button>
      <Button variant="secondary" disabled={pending} onClick={() => decide("decline")}>
        {spinning("decline") ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <X className="size-4" aria-hidden />
        )}
        Decline
      </Button>
    </div>
  );
}
