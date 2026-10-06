/**
 * What this reader changed about a post in this tab: their pin and their
 * reaction.
 *
 * Why it exists: the feed keeps the posts it has already loaded in client
 * state, so a card's props do not change when the server re-renders. A
 * control that kept its state with `useOptimistic` over those props fell back
 * to the stale value the moment its transition ended — which is why a saved
 * post looked unsaved again, and why a second press then deleted the save.
 * The same post can also be on screen twice (the card and its lightbox, a
 * card and a reel), and each kept its own copy.
 *
 * So the reader's own choices live here, keyed by post: every surface reads
 * the same value, a refusal rolls back only the change it made, and the
 * props remain the source of truth for everything the reader did not touch.
 *
 * Plain module state, deliberately: it is per tab, holds a handful of entries,
 * and a full reload (which re-reads the server) is the only reset it needs.
 * Pure here, so it can be tested without React; hooks wrap it in
 * `use-engagement.ts`.
 */

export type Entry<T> = { value: T; token: number };

export function createEngagementStore() {
  const pins = new Map<string, Entry<boolean>>();
  const reactions = new Map<string, Entry<string | null>>();
  const listeners = new Set<() => void>();
  let tokens = 0;

  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  function write<T>(map: Map<string, Entry<T>>, postId: string, value: T) {
    tokens += 1;
    const entry = { value, token: tokens };
    map.set(postId, entry);
    emit();
    return entry;
  }

  /**
   * Undo one change, but only if nothing newer has replaced it: a refusal of
   * the first of two quick presses must not undo the second.
   */
  function revert<T>(
    map: Map<string, Entry<T>>,
    postId: string,
    made: Entry<T>,
    previous: Entry<T> | undefined,
  ) {
    if (map.get(postId) !== made) return;
    if (previous) map.set(postId, previous);
    else map.delete(postId);
    emit();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    pin(postId: string): Entry<boolean> | undefined {
      return pins.get(postId);
    },
    setPin(postId: string, pinned: boolean): Entry<boolean> {
      return write(pins, postId, pinned);
    },
    revertPin(postId: string, made: Entry<boolean>, previous: Entry<boolean> | undefined) {
      revert(pins, postId, made, previous);
    },
    reaction(postId: string): Entry<string | null> | undefined {
      return reactions.get(postId);
    },
    setReaction(postId: string, emoji: string | null): Entry<string | null> {
      return write(reactions, postId, emoji);
    },
    revertReaction(
      postId: string,
      made: Entry<string | null>,
      previous: Entry<string | null> | undefined,
    ) {
      revert(reactions, postId, made, previous);
    },
  };
}

export type EngagementStore = ReturnType<typeof createEngagementStore>;

/** The one store the app uses. */
export const engagementStore = createEngagementStore();
