/**
 * Spell Tab Constants
 *
 * Constants for the word-to-sequence generation feature.
 */

import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { LetterAlias, SpellPreferences } from "./spell-models";

/**
 * Maximum word length for MVP
 */
export const MAX_WORD_LENGTH = 10;

/**
 * Default preferences for spell generation
 */
export const DEFAULT_SPELL_PREFERENCES: SpellPreferences = {
  targetStepCount: null,
  motionTypeFilter: null,
  maxReversals: null,
  highContinuity: true,
  handPathMode: "smooth",
  makeCircular: false,
  selectedLOOPType: null,
  constraintPreset: "mixed",
};

/**
 * Aliases for Greek letters - allows users to type text and get the symbol
 * Case-insensitive matching is applied during parsing
 */
export const GREEK_LETTER_ALIASES: LetterAlias[] = [
  // Dash variants (must come before base names since they're longer)
  { alias: "sigma-", letter: Letter.SIGMA_DASH },
  { alias: "delta-", letter: Letter.DELTA_DASH },
  { alias: "theta-", letter: Letter.THETA_DASH },
  { alias: "omega-", letter: Letter.OMEGA_DASH },
  { alias: "lambda-", letter: Letter.LAMBDA_DASH },
  { alias: "phi-", letter: Letter.PHI_DASH },
  { alias: "psi-", letter: Letter.PSI_DASH },

  // Full Greek names only - short aliases (bet, del, the, sig, etc.)
  // were removed because they collide with English words.
  // "BETSY" was parsed as [β, Y] instead of [B, E, T, S, Y].
  // Users can insert Greek letters via the palette buttons instead.
  { alias: "sigma", letter: Letter.SIGMA },
  { alias: "delta", letter: Letter.DELTA },
  { alias: "theta", letter: Letter.THETA },
  { alias: "omega", letter: Letter.OMEGA },
  { alias: "lambda", letter: Letter.LAMBDA },
  { alias: "phi", letter: Letter.PHI },
  { alias: "psi", letter: Letter.PSI },
  { alias: "alpha", letter: Letter.ALPHA },
  { alias: "beta", letter: Letter.BETA },
  { alias: "gamma", letter: Letter.GAMMA },
];

/**
 * All Greek letters that can be inserted via the palette
 * Organized by category for UI display
 */
export const GREEK_LETTER_PALETTE = {
  shift: [Letter.SIGMA, Letter.DELTA, Letter.THETA, Letter.OMEGA] as Letter[],
  crossShift: [
    Letter.SIGMA_DASH,
    Letter.DELTA_DASH,
    Letter.THETA_DASH,
    Letter.OMEGA_DASH,
  ] as Letter[],
  dash: [Letter.PHI, Letter.PSI, Letter.LAMBDA] as Letter[],
  dualDash: [Letter.PHI_DASH, Letter.PSI_DASH, Letter.LAMBDA_DASH] as Letter[],
  static: [Letter.ALPHA, Letter.BETA, Letter.GAMMA] as Letter[],
};

/**
 * Inverse of the rename-panel Greek shorthand (sig → Σ, etc.).
 * Used for ASCII-safe filenames - "VΛ-" becomes "Vlam-" instead of "V_-".
 */
export const GREEK_TO_ASCII: Record<string, string> = {
  Σ: "sig", Δ: "del", Θ: "the", Ω: "ome",
  Φ: "phi", Ψ: "psi", Λ: "lam",
  α: "alp", β: "bet", γ: "gam",
};

/**
 * Rewrite Greek letters in a sequence name using the ASCII shorthand that
 * matches the rename panel convention. Returns a string safe for most
 * downstream uses (filenames, URLs, logs).
 */
export function greekToAscii(text: string): string {
  return text.replace(/[ΣΔΘΩΦΨΛαβγ]/g, (c) => GREEK_TO_ASCII[c] ?? c);
}

/**
 * Display labels for Greek letters in the UI
 */
export const GREEK_LETTER_DISPLAY: Record<string, string> = {
  [Letter.SIGMA]: "Σ",
  [Letter.DELTA]: "Δ",
  [Letter.THETA]: "Θ",
  [Letter.OMEGA]: "Ω",
  [Letter.SIGMA_DASH]: "Σ-",
  [Letter.DELTA_DASH]: "Δ-",
  [Letter.THETA_DASH]: "Θ-",
  [Letter.OMEGA_DASH]: "Ω-",
  [Letter.PHI]: "Φ",
  [Letter.PSI]: "Ψ",
  [Letter.LAMBDA]: "Λ",
  [Letter.PHI_DASH]: "Φ-",
  [Letter.PSI_DASH]: "Ψ-",
  [Letter.LAMBDA_DASH]: "Λ-",
  [Letter.ALPHA]: "α",
  [Letter.BETA]: "β",
  [Letter.GAMMA]: "γ",
};

/**
 * Letters that can serve as "bridge" letters to transition between placement groups
 * These are letters that start in one placement group and end in another
 */
export const BRIDGE_LETTER_CANDIDATES = {
  // From alpha to beta
  alphaToBeta: [Letter.J, Letter.K, Letter.L, Letter.PSI] as Letter[],
  // From alpha to gamma
  alphaToGamma: [Letter.SIGMA, Letter.DELTA] as Letter[],
  // From beta to alpha
  betaToAlpha: [Letter.D, Letter.E, Letter.F, Letter.PHI] as Letter[],
  // From beta to gamma
  betaToGamma: [Letter.SIGMA_DASH, Letter.DELTA_DASH] as Letter[],
  // From gamma to alpha
  gammaToAlpha: [Letter.W, Letter.X, Letter.W_DASH, Letter.X_DASH] as Letter[],
  // From gamma to beta
  gammaToBeta: [Letter.Y, Letter.Z, Letter.Y_DASH, Letter.Z_DASH] as Letter[],
};
