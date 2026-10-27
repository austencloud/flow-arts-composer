/**
 * Run one account's profile sync at a time, across every tab of this origin.
 *
 * The sync reads users/{uid} and, when it is missing, creates it with a full
 * setDoc. Two tabs open on a brand-new account (or guest) both read "missing",
 * and the second create lands on the document the first just wrote. Firestore
 * evaluates that second write as an update, whose rule admits only owner
 * profile fields, so it is denied ("create-public-profile", 2026-10-21 and
 * 2026-10-22). Serialized, the second tab reads the finished document and takes
 * the update path instead.
 *
 * Web Locks span tabs. Without them (old browsers, tests) the chain below still
 * serializes calls within this tab.
 */
const tabQueue = new Map<string, Promise<void>>();

// A tab that froze or went offline mid-sync keeps its lock. Past this wait the
// sync runs unlocked rather than never, which is no worse than before the lock.
const LOCK_WAIT_MS = 15_000;

export function runProfileSyncExclusively(
  uid: string,
  sync: () => Promise<void>
): Promise<void> {
  const locks =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined;
  if (locks?.request) {
    const name = `tka-profile-sync:${uid}`;
    if (typeof AbortSignal.timeout !== "function") {
      return locks.request(name, () => sync());
    }
    return locks
      .request(name, { signal: AbortSignal.timeout(LOCK_WAIT_MS) }, () =>
        sync()
      )
      .catch((error: unknown) => {
        const errorName = (error as { name?: unknown } | null)?.name;
        if (errorName === "TimeoutError" || errorName === "AbortError") {
          return sync();
        }
        throw error;
      });
  }

  const previous = tabQueue.get(uid) ?? Promise.resolve();
  const next = previous.then(sync, sync);
  tabQueue.set(uid, next);
  const forget = () => {
    if (tabQueue.get(uid) === next) tabQueue.delete(uid);
  };
  next.then(forget, forget);
  return next;
}
