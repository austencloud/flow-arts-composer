/**
 * Motion data for the Type 1 to 6 turn breakdowns on the web, copied from the
 * print pages (the print artboard stays the source of truth):
 *   Type1DualShiftPage  A¹, B¹, C¹ (High), C₁ (Low)
 *   Type2ShiftPage      W¹, W₁ Same, W₁ Opp
 *   Type3CrossShiftPage Z-¹, Z-₁ Same, Z-₁ Opp
 *   Type4DashPage       Φ¹, Φ₁
 *   Type5DualDashPage   Ψ-¹, Λ-¹ opening, Λ-¹ closing
 *   Type6StaticPage     α¹, Γ¹ opening, Γ¹ closing
 * Blue is the left hand, red the right.
 */
import {
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;
const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;
const NOROT = RotationDirection.NO_ROTATION;
const { PRO, ANTI, DASH, STATIC } = MotionType;

export type StripHand = {
  type: MotionType;
  from: GridLocation;
  to: GridLocation;
  rot: RotationDirection;
  turns: number;
};

export type TypeStrip = { word: string; left: StripHand; right: StripHand };

const hand = (
  type: MotionType,
  from: GridLocation,
  to: GridLocation,
  rot: RotationDirection,
  turns: number
): StripHand => ({ type, from, to, rot, turns });

// Type 1: blue s→w, red n→e.
export const TYPE1_A: TypeStrip = {
  word: "A-One",
  left: hand(PRO, S, W, CW, 1),
  right: hand(PRO, N, E, CW, 0),
};
export const TYPE1_B: TypeStrip = {
  word: "B-One",
  left: hand(ANTI, S, W, CCW, 1),
  right: hand(ANTI, N, E, CCW, 0),
};
export const TYPE1_C_HIGH: TypeStrip = {
  word: "C-High-One",
  left: hand(PRO, S, W, CW, 1),
  right: hand(ANTI, N, E, CCW, 0),
};
export const TYPE1_C_LOW: TypeStrip = {
  word: "C-Low-One",
  left: hand(PRO, S, W, CW, 0),
  right: hand(ANTI, N, E, CCW, 1),
};

// Type 2: W, blue static at west, red pro n→e.
const w = (turns: number, rot: RotationDirection) =>
  hand(STATIC, W, W, rot, turns);
const wShift = (turns: number) => hand(PRO, N, E, CW, turns);
export const TYPE2_HIGH: TypeStrip = {
  word: "W-High-One",
  left: w(0, NOROT),
  right: wShift(1),
};
export const TYPE2_SAME: TypeStrip = {
  word: "W-Same Low-One",
  left: w(1, CW),
  right: wShift(0),
};
export const TYPE2_OPP: TypeStrip = {
  word: "W-Opp Low-One",
  left: w(1, CCW),
  right: wShift(0),
};

// Type 3: Z-, blue dash s→n, red anti e→n.
const zDash = (turns: number, rot: RotationDirection) =>
  hand(DASH, S, N, rot, turns);
const zShift = (turns: number) => hand(ANTI, E, N, CW, turns);
export const TYPE3_HIGH: TypeStrip = {
  word: "Z-Dash High-One",
  left: zDash(0, NOROT),
  right: zShift(1),
};
export const TYPE3_SAME: TypeStrip = {
  word: "Z-Dash Same Low-One",
  left: zDash(1, CW),
  right: zShift(0),
};
export const TYPE3_OPP: TypeStrip = {
  word: "Z-Dash Opp Low-One",
  left: zDash(1, CCW),
  right: zShift(0),
};

// Type 4: Phi, blue static at south, red dash s→n.
export const TYPE4_HIGH: TypeStrip = {
  word: "Phi-High-One",
  left: hand(STATIC, S, S, NOROT, 0),
  right: hand(DASH, S, N, NOROT, 1),
};
export const TYPE4_LOW: TypeStrip = {
  word: "Phi-Low-One",
  left: hand(STATIC, S, S, CW, 1),
  right: hand(DASH, S, N, NOROT, 0),
};

// Type 5: Psi- (both n→s), Lam- (blue w→e, red s→n).
export const TYPE5_PSI: TypeStrip = {
  word: "Psi-Dash-One",
  left: hand(DASH, N, S, CW, 1),
  right: hand(DASH, N, S, NOROT, 0),
};
export const TYPE5_LAM_OPEN: TypeStrip = {
  word: "Lam-Dash-One opening",
  left: hand(DASH, W, E, NOROT, 0),
  right: hand(DASH, S, N, CCW, 1),
};
export const TYPE5_LAM_CLOSE: TypeStrip = {
  word: "Lam-Dash-One closing",
  left: hand(DASH, W, E, NOROT, 0),
  right: hand(DASH, S, N, CW, 1),
};

// Type 6: alpha (blue W, red E), gamma (blue S, red W); both static.
export const TYPE6_ALPHA: TypeStrip = {
  word: "Alpha-One",
  left: hand(STATIC, W, W, NOROT, 0),
  right: hand(STATIC, E, E, CW, 1),
};
export const TYPE6_GAMMA_OPEN: TypeStrip = {
  word: "Gamma-One opening",
  left: hand(STATIC, S, S, NOROT, 0),
  right: hand(STATIC, W, W, CW, 1),
};
export const TYPE6_GAMMA_CLOSE: TypeStrip = {
  word: "Gamma-One closing",
  left: hand(STATIC, S, S, NOROT, 0),
  right: hand(STATIC, W, W, CCW, 1),
};
