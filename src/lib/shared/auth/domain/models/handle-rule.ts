/**
 * How a handle is made from a person's name. Never from their email: the local
 * part of an address is often the address, near enough, and handles are public.
 *
 * No imports and no path aliases, because `scripts/creators/email-handles.mjs`
 * loads this file directly in Node. The Cloud Functions package cannot reach
 * outside its own folder, so `firebase-functions/src/profiles/handleFromName.ts`
 * is a copy; tests/unit/auth/handle-rule.test.ts holds the two in step.
 */

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;
export const HANDLE_PATTERN = /^[a-z0-9._]{3,30}$/;

/** Reserved system usernames (lowercase). */
export const RESERVED_HANDLES: readonly string[] = [
  // System accounts
  "admin",
  "administrator",
  "support",
  "help",
  "system",
  "root",
  "moderator",
  "mod",
  "staff",
  "official",
  "bot",
  // Brand-related
  "tka",
  "thekineticalphabet",
  "kinetic",
  "alphabet",
  "scribe",
  "tkascribe",
  "composer",
  "tkacomposer",
  "tkaflowarts",
  // Technical
  "api",
  "null",
  "undefined",
  "deleted",
  "anonymous",
  "guest",
  "user",
  "users",
  // Common
  "test",
  "demo",
  "example",
  "info",
  "contact",
  "team",
  "service",
  "account",
  "settings",
  "profile",
  "login",
  "signup",
  "register",
];

const PLACEHOLDER_STEM = "creator";
const PLACEHOLDER_PATTERN = /^creator\d{4}$/;

/** Letters that do not decompose into a base letter and an accent. */
const LATIN_FOLDS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

/**
 * The handle a name asks for, or null when it gives nothing usable: no Latin
 * letters to work with (a name in another script), too short, reserved, or
 * something that is really an email address.
 */
export function handleBaseFromName(
  name: string | null | undefined
): string | null {
  if (!name || name.includes("@")) return null;
  const base = name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[ßæœøłđðþı]/g, (letter) => LATIN_FOLDS[letter] ?? "")
    .replace(/[\s\-‐-―]+/g, ".")
    .replace(/[^a-z0-9._]/g, "")
    .replace(/[._]{2,}/g, (run) => run.charAt(0))
    .slice(0, HANDLE_MAX_LENGTH)
    .replace(/^[._]+|[._]+$/g, "");
  if (base.length < HANDLE_MIN_LENGTH) return null;
  return RESERVED_HANDLES.includes(base) ? null : base;
}

function withSuffix(stem: string, suffix: string): string {
  const room = HANDLE_MAX_LENGTH - suffix.length;
  return `${stem.slice(0, room).replace(/[._]+$/, "")}${suffix}`;
}

function digits(count: number, random: () => number): string {
  const floor = 10 ** (count - 1);
  return String(floor + Math.floor(random() * 9 * floor));
}

/**
 * Handles to try, in order. A usable name is tried bare, then with a short
 * number. No usable name gets `creator` and four digits, never bare.
 */
export function handleCandidates(
  name: string | null | undefined,
  random: () => number = Math.random
): string[] {
  const base = handleBaseFromName(name);
  const lengths: number[] = base
    ? [2, 2, 2, 3, 3, 3, 4, 4, 4, 4]
    : Array(10).fill(4);
  const stem = base ?? PLACEHOLDER_STEM;
  const candidates = lengths.map((count) =>
    withSuffix(stem, digits(count, random))
  );
  candidates.push(withSuffix(stem, String(Date.now()).slice(-6)));
  return base ? [base, ...candidates] : candidates;
}

/** A nameless account's handle. It gives way once the account has a name. */
export function isPlaceholderHandle(
  handle: string | null | undefined
): boolean {
  return Boolean(handle && PLACEHOLDER_PATTERN.test(handle));
}
