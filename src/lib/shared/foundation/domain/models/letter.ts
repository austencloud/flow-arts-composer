import { LetterType } from "./letter-type";

/**
 * Letter — all TKA letters.
 *
 * Const-as-union (not a nominal TS enum) so the type is structurally identical
 * to `@tka/tka-types` `Letter`. The nominal enum blocked canonical `Step`
 * adoption in the reverse direction (tka literal -> app enum slot); the union
 * flows both ways with zero casts. Member names keep the app's historical
 * SCREAMING_SNAKE style; the VALUES are the canonical alphabet and match
 * `@tka/tka-types` exactly.
 */
export const Letter = {
  // Type1: Dual-Shift (A-V, 22 letters)
  A: "A",
  B: "B",
  C: "C",
  D: "D",
  E: "E",
  F: "F",
  G: "G",
  H: "H",
  I: "I",
  J: "J",
  K: "K",
  L: "L",
  M: "M",
  N: "N",
  O: "O",
  P: "P",
  Q: "Q",
  R: "R",
  S: "S",
  T: "T",
  U: "U",
  V: "V",

  // Type2: Shift (8 letters including Greek)
  W: "W",
  X: "X",
  Y: "Y",
  Z: "Z",
  SIGMA: "Σ",
  DELTA: "Δ",
  THETA: "Θ",
  OMEGA: "Ω",
  MU: "μ",
  NU: "ν",

  // Type3: Cross-Shift (8 cross variants)
  W_DASH: "W-",
  X_DASH: "X-",
  Y_DASH: "Y-",
  Z_DASH: "Z-",
  SIGMA_DASH: "Σ-",
  DELTA_DASH: "Δ-",
  THETA_DASH: "Θ-",
  OMEGA_DASH: "Ω-",

  // Type4: Dash (4 Greek dash letters - one dashes, one static)
  PHI: "Φ",
  PSI: "Ψ",
  LAMBDA: "Λ",
  TAU_DASH: "τ-",

  // Type5: Dual-Dash (3 dual dash variants)
  PHI_DASH: "Φ-",
  PSI_DASH: "Ψ-",
  LAMBDA_DASH: "Λ-",

  // Type6: Static (lowercase Greek letters for static placements)
  ALPHA: "α",
  BETA: "β",
  GAMMA: "γ",
  ZETA: "ζ",
  ETA: "η",
  TAU: "τ",
  TERRA: "⊕",
} as const;

export type Letter = (typeof Letter)[keyof typeof Letter];

const TYPE1_LETTERS: readonly Letter[] = [
  Letter.A,
  Letter.B,
  Letter.C,
  Letter.D,
  Letter.E,
  Letter.F,
  Letter.G,
  Letter.H,
  Letter.I,
  Letter.J,
  Letter.K,
  Letter.L,
  Letter.M,
  Letter.N,
  Letter.O,
  Letter.P,
  Letter.Q,
  Letter.R,
  Letter.S,
  Letter.T,
  Letter.U,
  Letter.V,
];

const TYPE2_LETTERS: readonly Letter[] = [
  Letter.W,
  Letter.X,
  Letter.Y,
  Letter.Z,
  Letter.SIGMA,
  Letter.DELTA,
  Letter.THETA,
  Letter.OMEGA,
  Letter.MU,
  Letter.NU,
];

const TYPE3_LETTERS: readonly Letter[] = [
  Letter.W_DASH,
  Letter.X_DASH,
  Letter.Y_DASH,
  Letter.Z_DASH,
  Letter.SIGMA_DASH,
  Letter.DELTA_DASH,
  Letter.THETA_DASH,
  Letter.OMEGA_DASH,
];

const TYPE4_LETTERS: readonly Letter[] = [Letter.PHI, Letter.PSI, Letter.LAMBDA, Letter.TAU_DASH];

const TYPE5_LETTERS: readonly Letter[] = [Letter.PHI_DASH, Letter.PSI_DASH, Letter.LAMBDA_DASH];

const TYPE6_LETTERS: readonly Letter[] = [
  Letter.ALPHA,
  Letter.BETA,
  Letter.GAMMA,
  Letter.ZETA,
  Letter.ETA,
  Letter.TAU,
  Letter.TERRA,
];

/**
 * Legacy spellings that exist in historical stored data but are not part of
 * the canonical alphabet. The legacy desktop convention wrote the gamma
 * start-placement letter as uppercase "Γ" (U+0393); the canon is lowercase
 * "γ" (U+03B3). import-sequence.cjs and repair-broken-start-placements.cjs
 * copied that convention into Firestore docs and QR blobs, and printed cards
 * embed the legacy form forever — so runtime normalization can never be
 * removed even after the stored docs are repaired.
 */
const LEGACY_LETTER_ALIASES: Record<string, Letter> = {
  Γ: Letter.GAMMA,
};

const CANONICAL_LETTERS = new Set<string>(Object.values(Letter));

/**
 * Resolve a raw letter string to its canonical Letter, mapping known legacy
 * aliases. Returns null when the input is not a TKA letter at all.
 */
export function normalizeLetter(raw: string | null | undefined): Letter | null {
  if (!raw) return null;
  if (CANONICAL_LETTERS.has(raw)) return raw as Letter;
  return LEGACY_LETTER_ALIASES[raw] ?? null;
}

/**
 * Get the LetterType for any letter enum value.
 * Tolerates known legacy aliases (so historical data renders instead of
 * crashing) but still throws for genuinely unknown input.
 */
export function getLetterType(letter: Letter): LetterType {
  const canonical = LEGACY_LETTER_ALIASES[letter] ?? letter;
  if (TYPE1_LETTERS.includes(canonical)) return LetterType.TYPE1;
  if (TYPE2_LETTERS.includes(canonical)) return LetterType.TYPE2;
  if (TYPE3_LETTERS.includes(canonical)) return LetterType.TYPE3;
  if (TYPE4_LETTERS.includes(canonical)) return LetterType.TYPE4;
  if (TYPE5_LETTERS.includes(canonical)) return LetterType.TYPE5;
  if (TYPE6_LETTERS.includes(canonical)) return LetterType.TYPE6;
  throw new Error(`Unknown letter: ${letter}`);
}
