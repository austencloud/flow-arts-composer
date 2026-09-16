import letterMappings from "../../../../../data/learn/letter-mappings.json";
export type TKALetter = keyof typeof letterMappings.letters;

export interface LetterPositionData {
  startPlacement: string;
  endPlacement: string;
  leftMotion: string;
  rightMotion: string;
}

const mappings = letterMappings.letters as Record<string, LetterPositionData>;

/**
 * Get the canonical movement type for a character
 */
export function getLetterType(char: string): number {
  const categories = letterMappings.categories;
  if (categories["dual-shift"].includes(char)) return 1;
  if (categories["shift"].includes(char)) return 2;
  if (categories["cross-shift"].includes(char)) return 3;
  if (categories["dash"].includes(char)) return 4;
  if (categories["dual_dash"].includes(char)) return 5;
  if (categories["static"].includes(char)) return 6;
  return 0;
}

/**
 * Normalize a position string (e.g., "alpha3" -> "alpha", "β5" -> "beta")
 */
function normalizeGroup(pos: string): string {
  const lower = pos.toLowerCase();
  const group = lower.replace(/[0-9]/g, "").trim();

  const greekMap: Record<string, string> = {
    "α": "alpha",
    "β": "beta",
    "γ": "gamma"
  };

  return greekMap[group] || group;
}

/**
 * Determine if a letter can follow another letter based on position continuity.
 * Logic: prev.endPlacement group must match next.startPlacement group.
 * Groups are normalized (e.g., alpha1 -> alpha).
 */
export function canFollow(prevChar: string, nextChar: string): boolean {
  const prev = mappings[prevChar];
  const next = mappings[nextChar];

  if (!prev || !next) return true; // Fail-safe to allowed

  const prevEndGroup = normalizeGroup(prev.endPlacement);
  const nextStartGroup = normalizeGroup(next.startPlacement);

  return prevEndGroup === nextStartGroup;
}

/**
 * Get all letters that can validly follow the given character
 */
export function getValidNextLetters(lastChar: string): string[] {
  return Object.keys(mappings).filter(char => canFollow(lastChar, char));
}

/**
 * Parse a sequence string and return the last meaningful letter/character.
 * Handles multi-char characters like 'W-' or 'Σ-'.
 */
export function getLastLetter(query: string): string | null {
  if (!query) return null;

  const allChars = Object.keys(mappings).sort((a, b) => b.length - a.length);

  // Check for suffix matches
  for (const char of allChars) {
    if (query.endsWith(char)) return char;
  }

  return null;
}
