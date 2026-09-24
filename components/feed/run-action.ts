"use client";

import { toast } from "@/components/ui/toast";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Runs a community action and says so when it fails.
 *
 * Every mutation in the feed is optimistic: the arrow fills, the bookmark
 * darkens, the reaction appears, all before the server has answered. React
 * discards an optimistic value when its transition ends, so a refusal rolls
 * the control back on its own — but silently, which reads as the button not
 * working rather than as the server saying no.
 *
 * This is the other half of that: the state reverts, and the reason is said
 * out loud. Refusals here are ordinary — no permission, too fast, the post is
 * gone — and each of them is something the reader needs to know.
 */
export async function runAction(
  action: (data: FormData) => Promise<ActionResult | void>,
  data: FormData,
): Promise<boolean> {
  try {
    const result = await action(data);
    if (result && result.ok === false) {
      toast.danger(result.error);
      return false;
    }
    return true;
  } catch {
    // A thrown action is a network failure or a server crash, not a refusal.
    toast.danger("That did not go through. Check your connection and try again.");
    return false;
  }
}
