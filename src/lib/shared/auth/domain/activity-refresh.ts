/**
 * How old a visit stamp may get before a page load with nothing else to save
 * refreshes it. The stamps are users/{uid}.lastActivityDate and each linked
 * browser's lastSeen under users/{uid}/devices. An active user costs one write
 * an hour per stamp instead of one per page load, and a stamp is never more
 * than an hour behind their latest visit, which lastActivityDate's readers
 * (Pulse's six-hour "is back" alerts, the admin "active today" counts, the
 * creators list's weekly bands) can absorb.
 */
export const ACTIVITY_REFRESH_MS = 60 * 60 * 1000;

/** Whether a stored Firestore timestamp is missing or due for a refresh. */
export function isActivityStale(recordedAt: unknown): boolean {
  const recordedAtMs = (
    recordedAt as { toMillis?: () => number } | null | undefined
  )?.toMillis?.();
  return (
    typeof recordedAtMs !== "number" ||
    Date.now() - recordedAtMs >= ACTIVITY_REFRESH_MS
  );
}
