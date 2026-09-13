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
 * Saves made while NO identity existed at all.
 *
 * `ensureGuestIdentity()` swallows its failures (anon provider disabled,
 * offline), so a save can legitimately complete with `effectiveUserId === null`.
 * `recordSavedSequenceId(null, …)` no-ops, which used to leave the row owned by
 * nobody: the guest library read filters by ledger and the background retry
 * filters by ledger, so the row was invisible AND unsyncable — durable in Dexie
 * and reachable by nothing.
 *
 * These ids are parked here instead, and adopted by the NEXT ANONYMOUS identity
 * this browser provisions (see `adoptUnownedSequenceIds`, called only from
 * guest-identity). That is the same person continuing the same guest session.
 * A full account signing in must never adopt them — it did not make them, and
 * auto-adoption across an account boundary is the whole class of bug this work
 * exists to remove.
 */
const UNOWNED_KEY = "tka-unowned-seq-ids";

/** Park a save that completed with no identity to attribute it to. */
export function recordUnownedSequenceId(id: string): void {
  if (!id || typeof window === "undefined") return;
  try {
    const ids = new Set(getUnownedSequenceIds());
    ids.add(id);
    localStorage.setItem(UNOWNED_KEY, JSON.stringify([...ids]));
  } catch {
    // Private browsing / quota. The Dexie row still exists; it simply stays
    // unattributed, which is the safe direction.
  }
}

export function getUnownedSequenceIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(UNOWNED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Hand every parked id to `uid` and clear the park.
 *
 * ONLY call this for a freshly provisioned ANONYMOUS identity. Calling it for a
 * full account would attribute work to an account that did not make it.
 * Returns the ids adopted, for logging and tests.
 */
export function adoptUnownedSequenceIds(
  uid: string | null | undefined
): string[] {
  if (!uid || typeof window === "undefined") return [];
  const orphans = getUnownedSequenceIds();
  if (orphans.length === 0) return [];

  for (const id of orphans) recordSavedSequenceId(uid, id);

  // `recordSavedSequenceId` is best-effort: it swallows quota and
  // private-browsing failures. Clearing the park on the strength of having
  // CALLED it would drop the id from both sides on a failed write — the row
  // would end up owned by nobody and parked by nobody, which is worse than the
  // orphaning this whole mechanism exists to fix. Read the owner ledger back
  // and release only what actually persisted.
  const owned = new Set(getSavedSequenceIds(uid));
  const adopted = orphans.filter((id) => owned.has(id));
  const stillParked = orphans.filter((id) => !owned.has(id));

  try {
    if (stillParked.length === 0) {
      localStorage.removeItem(UNOWNED_KEY);
    } else {
      localStorage.setItem(UNOWNED_KEY, JSON.stringify(stillParked));
    }
  } catch {
    // The park is unchanged, so every id stays claimable. Re-adopting an id
    // that did persist is idempotent, so leaving it parked costs nothing.
  }
  return adopted;
}

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
