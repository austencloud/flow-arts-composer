/**
 * Per-uid ledger of locally-saved sequence ids.
 *
 * Dexie's library table is flat, not uid-scoped, and is never cleared on
 * sign-out (tka-database.clearAllData has no auth-change caller). So "every
 * local row" is NOT "this user's saves" on a shared/public device — a prior
 * user's library sits in the same table.
 *
 * This ledger records which sequence ids a given uid actually saved, so a
 * guest→account upgrade can capture EXACTLY that guest's own drafts for import
 * (anonymous-upgrade.captureAnonymousDrafts) instead of sweeping up a prior
 * user's sequences into the colliding account. Keyed by uid; best-effort
 * (a storage failure degrades to "capture nothing", which is safe).
 */
const PREFIX = "tka-saved-seq-ids:";

/**
 * The ids `uid` owns locally, as a Set for membership tests.
 *
 * Every reader that asks "is this local Dexie row MINE?" needs a set, not the
 * array: the guest library read (create-browse-engine), the anon draft capture
 * (anonymous-upgrade), the guest save cap, and the background sync retry. The
 * first two each built `new Set(getSavedSequenceIds(uid))` inline; this is the
 * shared owner for that read so the cap and the retry don't become a third and
 * fourth copy of the same predicate.
 *
 * An unknown uid, a null uid, or unreadable storage all yield an EMPTY set.
 * Every caller must treat empty as "owns nothing here" — never as "owns
 * everything", which is exactly the conflation that let one account's rows be
 * replayed into another's library.
 */
export function getOwnedSequenceIdSet(
  uid: string | null | undefined
): ReadonlySet<string> {
  return new Set(getSavedSequenceIds(uid));
}

export function recordSavedSequenceId(
  uid: string | null | undefined,
  id: string
): void {
  if (!uid || !id || typeof window === "undefined") return;
  try {
    const ids = new Set(getSavedSequenceIds(uid));
    ids.add(id);
    localStorage.setItem(PREFIX + uid, JSON.stringify([...ids]));
  } catch {
    // Private browsing / quota — capture falls back to [] (safe), never a leak.
  }
}

export function getSavedSequenceIds(uid: string | null | undefined): string[] {
  if (!uid || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PREFIX + uid);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function removeSavedSequenceIds(
  uid: string | null | undefined,
  ids: readonly string[]
): void {
  if (!uid || ids.length === 0 || typeof window === "undefined") return;
  try {
    const removed = new Set(ids);
    const remaining = getSavedSequenceIds(uid).filter((id) => !removed.has(id));
    if (remaining.length === 0) {
      localStorage.removeItem(PREFIX + uid);
    } else {
      localStorage.setItem(PREFIX + uid, JSON.stringify(remaining));
    }
  } catch {
    // Storage can be blocked or full. The Dexie delete remains authoritative.
  }
}
