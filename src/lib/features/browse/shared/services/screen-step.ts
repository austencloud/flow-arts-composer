/**
 * Which way a Browse screen change moves.
 *
 * Browse has two places where one screen sits "under" others: the landing
 * under every section, and the Collections list under each collection. Going
 * from that root to anything else is forward, coming back to it is back, and
 * a move between two screens that are neither (Explore and Library, or one
 * collection straight to another) is a peer move. The caller decides what a
 * peer move looks like: the landing's sections keep a plain fade, a
 * collection to a collection steps forward.
 *
 * Worked out from the previous key alone, so the Crossfade gets its direction
 * on the same frame its key changes.
 */

/** Forward is 1, back is -1, a peer move (or no move) is 0. */
export type ScreenStep = 1 | -1 | 0;

export function screenStep(
  previous: string | null,
  next: string,
  root: string
): ScreenStep {
  if (previous === null || previous === next) return 0;
  if (previous === root) return 1;
  if (next === root) return -1;
  return 0;
}

/**
 * Follows a changing key and reports the step each change makes. Read
 * `step(key)` once per key change, from a `$derived`, so the step and the key
 * land in the same flush.
 */
export function createScreenStepTracker(root: string, initial: string | null) {
  let previous = initial;
  let last: ScreenStep = 0;
  return {
    step(next: string): ScreenStep {
      // A re-read with the key unchanged keeps the move that is running.
      if (next === previous) return last;
      last = screenStep(previous, next, root);
      previous = next;
      return last;
    },
  };
}
