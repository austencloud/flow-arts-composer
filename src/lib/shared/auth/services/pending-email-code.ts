/**
 * The email code a person asked for and has not entered yet.
 *
 * Checking the inbox often means leaving the page, so the request survives a
 * reload for half an hour. The code form restores it, and the email tabs use
 * it to open on the code form instead of the password form.
 */

const STORAGE_KEY = "pendingMagicLinkCode";
const LIFETIME_MS = 30 * 60 * 1000;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PendingEmailCode {
  requestId: string;
  email: string;
}

export function persistPendingEmailCode(requestId: string, email: string) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ requestId, email, expiresAt: Date.now() + LIFETIME_MS })
    );
  } catch {
    // Storage unavailable: the code still works until the page reloads.
  }
}

export function clearPendingEmailCode() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

/** The unexpired request, or null. Malformed or expired entries are removed. */
export function readPendingEmailCode(): PendingEmailCode | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const pending = JSON.parse(raw) as {
      requestId?: unknown;
      email?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof pending.requestId === "string" &&
      REQUEST_ID_PATTERN.test(pending.requestId) &&
      typeof pending.email === "string" &&
      pending.email &&
      typeof pending.expiresAt === "number" &&
      pending.expiresAt > Date.now()
    ) {
      return { requestId: pending.requestId, email: pending.email };
    }
  } catch {
    // Fall through to clearing the unreadable entry.
  }
  clearPendingEmailCode();
  return null;
}
