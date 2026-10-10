/**
 * Letter Type Classifier
 *
 * Classifies TKA letters into their 6 type categories and provides
 * filtering capabilities based on letter type.
 */

import { Letter, getLetterType } from "#lib/shared/foundation/domain/models/letter.js";
import { LetterType } from "#lib/shared/foundation/domain/models/letter-type.js";

/**
 * Interface describing the shape of the letter type classifier module.
 * Consumers that previously held a class instance can use this type.
 */
export interface LetterTypeClassifier {
  classify: (letter: Letter) => LetterType;
  getLettersOfType: (type: LetterType) => Letter[];
  isType: (letter: Letter, type: LetterType) => boolean;
}

const typeToLettersMap: Map<LetterType, Letter[]> = new Map([
  [
    LetterType.TYPE1,
    [
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
    ],
  ],
  [
    LetterType.TYPE2,
    [
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
    ],
  ],
  [
    LetterType.TYPE3,
    [
      Letter.W_DASH,
      Letter.X_DASH,
      Letter.Y_DASH,
      Letter.Z_DASH,
      Letter.SIGMA_DASH,
      Letter.DELTA_DASH,
      Letter.THETA_DASH,
      Letter.OMEGA_DASH,
    ],
  ],
  [LetterType.TYPE4, [Letter.PHI, Letter.PSI, Letter.LAMBDA]],
  [LetterType.TYPE5, [Letter.PHI_DASH, Letter.PSI_DASH, Letter.LAMBDA_DASH]],
  [
    LetterType.TYPE6,
    [
      Letter.ALPHA,
      Letter.BETA,
      Letter.GAMMA,
      Letter.ZETA,
      Letter.ETA,
      Letter.TAU,
      Letter.TERRA,
    ],
  ],
]);

export function classify(letter: Letter): LetterType {
  return getLetterType(letter);
}

export function getLettersOfType(type: LetterType): Letter[] {
  return typeToLettersMap.get(type) || [];
}

export function isType(letter: Letter, type: LetterType): boolean {
  return classify(letter) === type;
}
