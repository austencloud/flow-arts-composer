/**
 * Release tour: the one arrival a highlight's "Show me" has promised.
 *
 * Clicking "Show me" on a highlight sets a pending arrival, then navigation
 * leaves for the note's surface. Once the target has mounted, the arrival
 * watcher (ReleaseTourArrival.svelte) consumes it: it pulses the element
 * named by `anchor`, or shows `callout` when there is no anchor to find.
 * At most one arrival is ever pending; a newer click replaces an older one.
 *
 * Closest existing owner is the navigation DeepLinker's set/consume handoff,
 * which carries a sequence into a module on mount. This carries an arrival
 * hint for any surface, consumed by a global watcher rather than a module,
 * so it is its own small state. Same shape as whatsNewState: a factory, and
 * the app's one instance exported beside it, because the arrival outlives the
 * settings surface that set it.
 */

import type { ModuleId } from "#lib/shared/navigation/domain/types.js";

export interface ReleaseArrival {
  moduleId: ModuleId;
  tabId?: string;
  /** A `data-release-anchor` value on the target surface. */
  anchor?: string;
  /** One plain sentence to show on arrival when no anchor can be shown. */
  callout?: string;
}

export function createReleaseTourState() {
  let pending = $state<ReleaseArrival | null>(null);

  return {
    get pending() {
      return pending;
    },
    /** Promise an arrival. Replaces any earlier promise. */
    setPending(arrival: ReleaseArrival) {
      pending =
        arrival.anchor || arrival.callout
          ? { ...arrival }
          : // Nothing to do on arrival: reaching the tab is the whole experience.
            null;
    },
    /** Take the pending arrival, leaving none behind. */
    consume(): ReleaseArrival | null {
      const taken = pending;
      pending = null;
      return taken;
    },
    clear() {
      pending = null;
    },
  };
}

export type ReleaseTourState = ReturnType<typeof createReleaseTourState>;

export const releaseTourState = createReleaseTourState();
