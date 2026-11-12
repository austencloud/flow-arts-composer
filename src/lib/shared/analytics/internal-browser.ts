/**
 * Has an admin ever signed in on this browser?
 *
 * `is_admin` only reaches PostHog as a person property on identify, so it
 * covers signed-in sessions. Austen's devices also browse signed out, and a
 * sign-out reset gives the browser a fresh anonymous person with no
 * `is_admin` on it. Those visits counted as outside people. PostHog registers
 * `is_internal` as a super property from this flag, so every event from the
 * browser carries it, signed in or not.
 *
 * The flag itself is the one the visit report already keeps (an admin's
 * browser never raises a visit alert), so browsers marked before this existed
 * count too. Kept in its own module because `visit-report.ts` imports
 * `posthog.ts`, and `posthog.ts` needs this.
 */

/** The visit report's localStorage key; its `admin` field is the flag. */
export const VISIT_STATE_KEY = "tka-visit-report";

function readVisitState(): Record<string, unknown> {
  const raw = localStorage.getItem(VISIT_STATE_KEY);
  const parsed: unknown = raw ? JSON.parse(raw) : null;
  return parsed && typeof parsed === "object"
    ? (parsed as Record<string, unknown>)
    : {};
}

export function isInternalBrowser(): boolean {
  try {
    return readVisitState()["admin"] === true;
  } catch {
    // Storage blocked or unparseable: treat as an outside visitor.
    return false;
  }
}

/** Mark this browser for good. Keeps the visit report's other fields. */
export function markInternalBrowser(): void {
  try {
    const state = readVisitState();
    if (state["admin"] === true) return;
    localStorage.setItem(
      VISIT_STATE_KEY,
      JSON.stringify({ ...state, admin: true })
    );
  } catch {
    // Private windows can refuse storage; this session's events still carry
    // the super property, only later visits lose it.
  }
}
