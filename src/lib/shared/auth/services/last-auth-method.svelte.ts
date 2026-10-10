/**
 * Last-used sign-in method.
 *
 * Returning users forget which button they signed up with, retry the wrong one,
 * hit "account exists with a different credential", and bounce. Recording the
 * method they last used and badging that button removes the guess. Clerk,
 * WorkOS AuthKit and Better Auth all ship this; the win is well established.
 *
 * What we deliberately do NOT store: the email, the display name, the uid.
 * Only the method name. The usual criticism of this pattern is that it leaks
 * WHO owns the device to anyone who opens the login screen — storing nothing
 * but "google" defuses that. It also means this file never touches PII.
 *
 * Device-scoped (localStorage), and it deliberately SURVIVES sign-out: the
 * whole point is the next sign-in on this device. Account deletion clears it.
 */

import { browser } from "$app/env";

export type LastAuthMethod =
  | "google"
  | "facebook"
  | "instagram"
  | "magic-link"
  | "password";

const STORAGE_KEY = "tka:last-auth-method";

/**
 * Half a year. Long enough that a seasonal user still gets the hint, short
 * enough that a stale badge on a shared/loaner device eventually stops
 * pointing at someone else's method.
 */
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

const VALID_METHODS: readonly LastAuthMethod[] = [
  "google",
  "facebook",
  "instagram",
  "magic-link",
  "password",
];

interface StoredRecord {
  method: LastAuthMethod;
  at: number;
}

function isValidMethod(value: unknown): value is LastAuthMethod {
  return (
    typeof value === "string" && VALID_METHODS.includes(value as LastAuthMethod)
  );
}

/**
 * Read + validate + expire. Anything malformed (hand-edited storage, a value
 * written by an older shape, a quota-evicted partial write) reads as "unknown"
 * rather than throwing — a missing badge is a non-event, a crashed sign-in
 * screen is not.
 */
function read(): LastAuthMethod | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredRecord>;
    if (!isValidMethod(parsed?.method)) return null;
    if (typeof parsed.at !== "number" || !Number.isFinite(parsed.at))
      return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;

    return parsed.method;
  } catch {
    return null;
  }
}

// Mirrored in a rune so the badge appears/moves without a remount. The auth
// modal stays mounted across open/close, so a plain module-init read would go
// stale after a sign-in → sign-out → reopen round trip.
let current = $state<LastAuthMethod | null>(read());

/** The method this device last signed in with, or null if unknown/expired. */
export function getLastAuthMethod(): LastAuthMethod | null {
  return current;
}

/**
 * Call on every SUCCESSFUL sign-in, from the auth service that owns the flow —
 * never from a button handler. There are ~10 entry paths (popup, One Tap,
 * native SDK, desktop OAuth, anonymous upgrade, magic-link completion) and only
 * the services see all of them.
 *
 * Not called for anonymous/guest sessions: "guest" is not a button on the
 * sign-in screen, so badging it would point at nothing.
 */
export function recordLastAuthMethod(method: LastAuthMethod): void {
  current = method;
  if (!browser) return;
  try {
    const record: StoredRecord = { method, at: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage disabled (private mode, quota, locked-down browser). The badge
    // is a convenience; sign-in itself must not care.
  }
}

/** Clear on account deletion — the account it referred to is gone. */
export function clearLastAuthMethod(): void {
  current = null;
  if (!browser) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See recordLastAuthMethod.
  }
}
