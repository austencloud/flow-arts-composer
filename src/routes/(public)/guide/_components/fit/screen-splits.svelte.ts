/** A joined screen that would draw its figure smaller than this splits. */
export const JOINED_MIN_FIT = 0.5;

/**
 * Which joined screens of a guide page fell back because they did not fit.
 *
 * A joined screen (words and a picture together) is a group with its own
 * step. Step 0 is the joined screen; each later step swaps just that group's
 * screens, in the same place in the list, for a cut that needs less room.
 * Nothing before or after the group changes, so a reader always moves
 * forward and nothing repeats.
 */
export function createScreenSplits() {
  let steps = $state<Record<string, number>>({});
  const storeKey = () =>
    `guide-splits:${location.pathname}:${innerWidth}x${innerHeight}`;

  function save() {
    try {
      sessionStorage.setItem(storeKey(), JSON.stringify(steps));
    } catch {
      // A private window or blocked storage: the page just refinds the steps.
    }
  }

  return {
    /** How far a group has fallen back; 0 is the joined screen. */
    step: (group: string, max: number) => Math.min(steps[group] ?? 0, max),
    /**
     * For the page's window watcher: start again from what this tab already
     * found at this window size, so a reload lands on the same screen.
     */
    restore() {
      const found: Record<string, number> = {};
      try {
        const raw = JSON.parse(sessionStorage.getItem(storeKey()) ?? "{}");
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          for (const [group, n] of Object.entries(raw)) {
            if (typeof n === "number" && Number.isInteger(n) && n >= 0) {
              found[group] = n;
            }
          }
        }
      } catch {
        // Unreadable storage or bad data: start from the joined screens.
      }
      steps = found;
    },
    /** The group's screen did not fit: fall back one step. */
    bump(group: string, max: number) {
      const now = Math.min(steps[group] ?? 0, max);
      if (now >= max) return;
      steps = { ...steps, [group]: now + 1 };
      save();
    },
    /** Changes with every fallback (GuideScreens cutKey). */
    get key() {
      return JSON.stringify(steps);
    },
  };
}
