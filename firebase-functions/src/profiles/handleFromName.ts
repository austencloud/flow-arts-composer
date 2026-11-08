/**
 * Copy of src/lib/shared/auth/domain/models/handle-rule.ts for the server, which
 * mints profiles for signups whose client write never landed. This package
 * cannot import from outside its folder; tests/unit/auth/handle-rule.test.ts
 * fails when the two disagree.
 */

const HANDLE_MIN_LENGTH = 3;
const HANDLE_MAX_LENGTH = 30;

export const RESERVED_HANDLES: readonly string[] = [
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
  "tka",
  "thekineticalphabet",
  "kinetic",
  "alphabet",
  "scribe",
  "tkascribe",
  "composer",
  "tkacomposer",
  "tkaflowarts",
  "api",
  "null",
  "undefined",
  "deleted",
  "anonymous",
  "guest",
  "user",
  "users",
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
