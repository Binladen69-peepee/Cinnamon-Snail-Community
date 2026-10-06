"use client";

import { useMemo, useSyncExternalStore, useTransition } from "react";
import { reactAction, setPinAction } from "@/app/(member)/community-actions";
import { runAction } from "@/components/feed/run-action";
import { engagementStore as store } from "@/components/feed/engagement-store";
import { applyReactionChange } from "@/lib/community/reactions";
import { toast } from "@/components/ui/toast";

/**
 * The reader's pin on a post, and the way to change it.
 *
 * `initial` is what the server said when the post was loaded. Once the reader
 * presses the control in this tab, the store's value wins everywhere the post
 * is shown, until the page is reloaded.
 */
export function usePin(postId: string, initial: boolean) {
  const entry = useSyncExternalStore(
    store.subscribe,
    () => store.pin(postId),
    () => undefined,
  );
  const pinned = entry ? entry.value : initial;
  const [pending, startTransition] = useTransition();

  function setPinned(next: boolean) {
    const previous = store.pin(postId);
    const made = store.setPin(postId, next);
    const data = new FormData();
    data.set("postId", postId);
    data.set("pinned", String(next));
    startTransition(async () => {
      const ok = await runAction(setPinAction, data);
      if (!ok) {
        store.revertPin(postId, made, previous);
        return;
      }
      // The post does not jump to the top while the member is reading; it is
      // there next time they open the Kitchen Table, and this says so.
      if (next) toast.success("Pinned. It will sit at the top of your Kitchen Table.");
    });
  }

  return {
    pinned,
    pending,
    toggle: () => setPinned(!pinned),
    setPinned,
  };
}

/**
 * The reader's reaction to a post, the counts that follow from it, and the
 * ways to change it.
 *
 * The counts are derived, not stored: the server's counts already include the
 * reaction the reader had when the post was loaded, so moving from that one to
 * the current one is the whole adjustment. A fresh render that already counts
 * the change therefore never counts it twice.
 */
export function useReaction(
  postId: string,
  initialMine: string | null,
  initialCounts: Record<string, number>,
) {
  const entry = useSyncExternalStore(
    store.subscribe,
    () => store.reaction(postId),
    () => undefined,
  );
  const mine = entry ? entry.value : initialMine;
  const counts = useMemo(
    () => applyReactionChange(initialCounts, initialMine, mine),
    [initialCounts, initialMine, mine],
  );
  const total = useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + n, 0),
    [counts],
  );
  const [, startTransition] = useTransition();

  /** Make the reader's reaction exactly `emoji`, or none. */
  function setReaction(emoji: string | null) {
    if (emoji === mine) return;
    const previous = store.reaction(postId);
    const made = store.setReaction(postId, emoji);
    const data = new FormData();
    data.set("postId", postId);
    data.set("intent", emoji ? "set" : "clear");
    if (emoji) data.set("emoji", emoji);
    startTransition(async () => {
      const ok = await runAction(reactAction, data);
      if (!ok) store.revertReaction(postId, made, previous);
    });
  }

  return {
    mine,
    counts,
    total,
    setReaction,
    /** A press on one emoji: the same one again takes it off. */
    press: (emoji: string) => setReaction(mine === emoji ? null : emoji),
  };
}
