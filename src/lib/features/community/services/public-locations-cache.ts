/**
 * The community map's pins, read once per page load.
 *
 * Opening a profile unmounts the Creators list and its map band; coming back
 * mounts them again. Without this the return trip re-read every location and
 * every pinned profile. The pins change only when someone sets or removes a
 * city, so a city change on this device clears the cache and a full reload
 * starts fresh. A failed read is not kept, so "Try again" reads again.
 *
 * Pure, with no Firestore import, so the caching itself is unit-tested.
 */

export interface CachedLoad<T> {
  get(): Promise<T>;
  invalidate(): void;
}

export function createCachedLoad<T>(load: () => Promise<T>): CachedLoad<T> {
  let pending: Promise<T> | null = null;
  return {
    get() {
      if (pending) return pending;
      const attempt = load();
      pending = attempt;
      attempt.catch(() => {
        if (pending === attempt) pending = null;
      });
      return attempt;
    },
    invalidate() {
      pending = null;
    },
  };
}
