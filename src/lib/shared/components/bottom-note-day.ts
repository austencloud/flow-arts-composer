/**
 * One automatic bottom card per day, across page loads.
 *
 * The install card and the returning-guest note both rise on their own, and
 * each keeps its own memory. This is the shared one: the local calendar day on
 * which either last showed itself. A card the person opens themselves (the
 * menu's "Get the app") neither reads nor writes it.
 *
 * Storage is passed in so the rule stays testable, and every call is safe
 * when storage is missing or throws: blocked storage reads as "nothing shown",
 * and each owner's per-visit flag still stops repeats within a page load.
 */

export const BOTTOM_NOTE_DAY_KEY = "tka-bottom-note-day";

/** The person's local calendar day, so midnight is theirs, not UTC's. */
export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True when an automatic bottom card already showed on this local day. */
export function hasBottomNoteShownToday(
  storage: Storage | undefined,
  now: Date = new Date()
): boolean {
  try {
    return storage?.getItem(BOTTOM_NOTE_DAY_KEY) === localDay(now);
  } catch {
    return false;
  }
}

/** Records that an automatic bottom card showed today. */
export function markBottomNoteShownToday(
  storage: Storage | undefined,
  now: Date = new Date()
): void {
  try {
    storage?.setItem(BOTTOM_NOTE_DAY_KEY, localDay(now));
  } catch {
    // Storage blocked: the per-visit flags still stop repeats.
  }
}
