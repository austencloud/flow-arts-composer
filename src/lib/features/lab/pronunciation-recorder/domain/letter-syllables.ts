import { Letter } from "$lib/shared/foundation/domain/models/letter";

/**
 * Syllables in each letter's SHORT name — `getLetterPronunciation().shortName`,
 * which is what the prompt asks for and therefore what the microphone hears.
 * Counting the full names here would price "sig dash" at three syllables, judge
 * every Greek read as rushed, and silently re-queue good takes until the word
 * retired. Written out rather than derived: no rule turns "W" into three
 * syllables and "psi" into one.
 */
const SYLLABLES: Record<string, number> = {
  [Letter.A]: 1, [Letter.B]: 1, [Letter.C]: 1, [Letter.D]: 1, [Letter.E]: 1,
  [Letter.F]: 1, [Letter.G]: 1, [Letter.H]: 1, [Letter.I]: 1, [Letter.J]: 1,
  [Letter.K]: 1, [Letter.L]: 1, [Letter.M]: 1, [Letter.N]: 1, [Letter.O]: 1,
  [Letter.P]: 1, [Letter.Q]: 1, [Letter.R]: 1, [Letter.S]: 1, [Letter.T]: 1,
  [Letter.U]: 1, [Letter.V]: 1,

  [Letter.W]: 3, [Letter.X]: 1, [Letter.Y]: 1, [Letter.Z]: 1,
  [Letter.W_DASH]: 4, [Letter.X_DASH]: 2, [Letter.Y_DASH]: 2, [Letter.Z_DASH]: 2,

  // Greek, shortened: sig, del, the, ome, phi, psi, lam, alp, bet, gam — one
  // syllable each, plus one for "dash".
  [Letter.SIGMA]: 1, [Letter.DELTA]: 1, [Letter.THETA]: 1, [Letter.OMEGA]: 1,
  [Letter.PHI]: 1, [Letter.PSI]: 1, [Letter.LAMBDA]: 1,
  [Letter.ALPHA]: 1, [Letter.BETA]: 1, [Letter.GAMMA]: 1,

  [Letter.SIGMA_DASH]: 2, [Letter.DELTA_DASH]: 2, [Letter.THETA_DASH]: 2,
  [Letter.OMEGA_DASH]: 2, [Letter.PHI_DASH]: 2, [Letter.PSI_DASH]: 2,
  [Letter.LAMBDA_DASH]: 2,

  // No shorthand in GREEK_TO_ASCII, so these keep their full names. All seven
  // are placement names rather than letters a word can hold.
  [Letter.MU]: 1, [Letter.NU]: 1, [Letter.ZETA]: 2, [Letter.ETA]: 2,
  [Letter.TAU]: 1, [Letter.TAU_DASH]: 2, [Letter.TERRA]: 2,
};

export function syllablesOf(letter: string): number {
  return SYLLABLES[letter] ?? 0;
}

export function syllablesInWord(letters: readonly string[]): number {
  return letters.reduce((total, letter) => total + syllablesOf(letter), 0);
}
