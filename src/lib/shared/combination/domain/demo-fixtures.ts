/**
 * Ground-truth demo cards for the sequence-combination engine.
 *
 * Every step here is transcribed from Austen's worked cards (2026-08-04) — the
 * GG+HH fusion card, the 8-beat FALG card, the ΦΨ bridge steps — and every one
 * of them has been verified to be an exact row of
 * `static/data/pictographs/DiamondPictographDataframe.csv`. The dataframe is
 * canon: where a transcription and the dataframe disagreed, the dataframe won
 * (see HHHH_CW's comment for the one case).
 *
 * Four invariants make these usable as ground truth, all enforced by
 * `tests/unit/combination/fixtures.test.ts` so a corrupted fixture can never
 * ship green:
 *   1. Each loop closes — step i starts where step i-1 ended, and the last step
 *      returns to the first step's seam.
 *   2. Every placement LABEL equals `getGridPlacementFromLocations` of that step's
 *      own motion locations.
 *   3. Every motion's `motionType` equals `deriveMotionType` of its own
 *      locations + rotation direction + turns. motionType is not free data; it
 *      is a function of the other three.
 *   4. Every step is a real (letter, placements, left motion, right motion) row of
 *      the diamond dataframe, and each loop is an orientation fixpoint under
 *      `recalculateAllOrientations`.
 *
 * **This lives in `src/`, not in `tests/`, because it has two consumers.** The
 * unit suite re-exports it verbatim (`tests/unit/combination/fixtures.ts`), and
 * the `/test/sequence-combinator` lab loads these cards as its preset material
 * — a lab that cannot preload known-good cards is a lab nobody can drive. The
 * data is hermetic either way: constructed in-process, no MCP, no network. Only
 * the dataframe CHECKS (which live in the test file) read the CSV from disk.
 */

import { withCalculatedArrowLocations } from "$lib/features/assemble-lab/services/builder-step-converter";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";

export interface MotionSpec {
  readonly type: MotionType;
  /** PROP rotation direction, exactly as printed on Austen's cards. */
  readonly rot: RotationDirection;
  readonly from: GridLocation;
  readonly to: GridLocation;
  readonly startOri: Orientation;
  readonly endOri: Orientation;
}

function makeMotion(spec: MotionSpec, hand: HandSide): MotionData {
  return createMotionData({
    motionType: spec.type,
    rotationDirection: spec.rot,
    startLocation: spec.from,
    endLocation: spec.to,
    startOrientation: spec.startOri,
    endOrientation: spec.endOri,
    turns: 0,
    hand,
    gridMode: GridMode.DIAMOND,
    // Provisional. The real value is computed by withCalculatedArrowLocations
    // below, once BOTH hands exist — a dash's canonical arrow location depends
    // on the OTHER hand's motion, so it cannot be derived per-motion.
    arrowLocation: spec.from,
  });
}

export function makeStep(
  stepNumber: number,
  letter: Letter,
  startPlacement: GridPlacement,
  endPlacement: GridPlacement,
  left: MotionSpec,
  right: MotionSpec
): StepData {
  const step = createStepData({
    id: `fixture-${letter}-${stepNumber}-${startPlacement}-${endPlacement}`,
    stepNumber,
    letter,
    startPlacement,
    endPlacement,
    gridMode: GridMode.DIAMOND,
    duration: 1,
    motions: {
      [HandSide.LEFT]: makeMotion(left, HandSide.LEFT),
      [HandSide.RIGHT]: makeMotion(right, HandSide.RIGHT),
    },
  });
  // Production's documented arrow-location seam — it delegates to
  // ArrowLocationCalculator, which routes DASH through the pictograph-aware
  // dash calculator. Without it Ψ's right dash and Φ's left dash both land on
  // "s" instead of the canonical "w".
  return withCalculatedArrowLocations(step);
}

/** The static both-hands hold the sequence begins from. */
function holdOf(motion: MotionData): MotionData {
  return createMotionData({
    ...motion,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    endLocation: motion.startLocation,
    endOrientation: motion.startOrientation,
    arrowLocation: motion.startLocation,
    turns: 0,
  });
}

export function makeLoop(
  id: string,
  word: string,
  steps: readonly StepData[]
): SequenceData {
  const first = steps[0]!;
  return createSequenceData({
    id,
    name: word,
    word,
    steps,
    isCircular: true,
    gridMode: GridMode.DIAMOND,
    startPlacement: createStartPlacementData({
      id: `${id}-start`,
      letter: null,
      startPlacement: first.startPlacement,
      endPlacement: first.startPlacement,
      gridPlacement: first.startPlacement,
      motions: {
        [HandSide.LEFT]: holdOf(first.motions.left),
        [HandSide.RIGHT]: holdOf(first.motions.right),
      },
    }),
  });
}

// ---------------------------------------------------------------------------
// Compact spec helpers
// ---------------------------------------------------------------------------

const CW = RotationDirection.CLOCKWISE;
const CCW = RotationDirection.COUNTER_CLOCKWISE;
const NONE = RotationDirection.NO_ROTATION;

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;
const IN = Orientation.IN;
const OUT = Orientation.OUT;

const { ALPHA1, ALPHA3, ALPHA5, ALPHA7, BETA1, BETA3, BETA5, BETA7 } =
  GridPlacement;

const spec =
  (type: MotionType) =>
  (
    rot: RotationDirection,
    from: GridLocation,
    to: GridLocation,
    startOri: Orientation,
    endOri: Orientation
  ): MotionSpec => ({ type, rot, from, to, startOri, endOri });

const pro = spec(MotionType.PRO);
const anti = spec(MotionType.ANTI);
const dash = spec(MotionType.DASH);
const held = spec(MotionType.STATIC);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * GGGG — clockwise pro cycle through the beta world (hand path cw: n→e→s→w).
 *
 * Steps 1–2 are literal (steps 7–8 of Austen's third FALG variant):
 *   G beta1>beta3, both hands pro cw n>e, in>in
 *   G beta3>beta5, both hands pro cw e>s, in>in
 * Steps 3–4 continue the same 90° pattern back to beta1. All four are pro-cw
 * dataframe rows.
 *
 * `prettier-ignore` on every card below is deliberate: one step per line IS the
 * transcription, and the auto-formatted six-lines-per-step form makes an
 * eight-step card unreadable against the paper it came from.
 */
// prettier-ignore
export const GGGG_CW: SequenceData = makeLoop("fx-gggg", "GGGG", [
  makeStep(1, Letter.G, BETA1, BETA3, pro(CW, N, E, IN, IN), pro(CW, N, E, IN, IN)),
  makeStep(2, Letter.G, BETA3, BETA5, pro(CW, E, S, IN, IN), pro(CW, E, S, IN, IN)),
  makeStep(3, Letter.G, BETA5, BETA7, pro(CW, S, W, IN, IN), pro(CW, S, W, IN, IN)),
  makeStep(4, Letter.G, BETA7, BETA1, pro(CW, W, N, IN, IN), pro(CW, W, N, IN, IN)),
]);

/**
 * HHHH (anti + ccw) — same hand path as GGGG (n→e→s→w) but the prop counter-
 * rotates, so the motion reads anti. Orientations alternate in↔out because anti
 * at 0 turns flips orientation every step.
 *
 * Steps 1–2 are literal (steps 7–8 of Austen's second example). A valid card in
 * its own right, kept in the corpus — but it is NOT the rotation-faithful twin
 * of GGGG_CW. See HHHH_CW.
 */
// prettier-ignore
export const HHHH_CCW: SequenceData = makeLoop("fx-hhhh-ccw", "HHHH", [
  makeStep(1, Letter.H, BETA1, BETA3, anti(CCW, N, E, IN, OUT), anti(CCW, N, E, IN, OUT)),
  makeStep(2, Letter.H, BETA3, BETA5, anti(CCW, E, S, OUT, IN), anti(CCW, E, S, OUT, IN)),
  makeStep(3, Letter.H, BETA5, BETA7, anti(CCW, S, W, IN, OUT), anti(CCW, S, W, IN, OUT)),
  makeStep(4, Letter.H, BETA7, BETA1, anti(CCW, W, N, OUT, IN), anti(CCW, W, N, OUT, IN)),
]);

/**
 * HHHH (anti + cw) — the rotation-faithful twin partner of GGGG_CW: the prop
 * keeps spinning CLOCKWISE and only the motion type flips pro→anti.
 *
 * Read `VariantDescriptor.rotationFaithful` carefully before using this.
 * "rotation direction AND locations preserved" cannot both hold: motionType is
 * a FUNCTION of (hand path, rotation direction) — that is exactly what
 * `deriveMotionType` computes — so holding n→e and cw fixed forces pro.
 * Flipping to anti while keeping the prop cw necessarily reverses the hand
 * path, which is why this loop runs beta1→beta7→beta5→beta3 (n→w→s→e) rather
 * than GGGG's beta1→beta3→beta5→beta7. There is no `H beta1>beta3 anti cw` row
 * in the dataframe; the four rows below are the complete anti-cw H set. Task 5's
 * variant generator must choose which half of that descriptor it honours.
 *
 * Austen's GHGH card corroborates the pairing: it fuses pro-cw G with anti-cw H.
 */
// prettier-ignore
export const HHHH_CW: SequenceData = makeLoop("fx-hhhh-cw", "HHHH", [
  makeStep(1, Letter.H, BETA1, BETA7, anti(CW, N, W, IN, OUT), anti(CW, N, W, IN, OUT)),
  makeStep(2, Letter.H, BETA7, BETA5, anti(CW, W, S, OUT, IN), anti(CW, W, S, OUT, IN)),
  makeStep(3, Letter.H, BETA5, BETA3, anti(CW, S, E, IN, OUT), anti(CW, S, E, IN, OUT)),
  makeStep(4, Letter.H, BETA3, BETA1, anti(CW, E, N, OUT, IN), anti(CW, E, N, OUT, IN)),
]);

/**
 * GHGH — Austen's 4-step GG+HH fusion card, transcribed verbatim:
 *   1 G beta5>beta7  left pro cw s>w in>in    right pro cw s>w in>in
 *   2 H beta7>beta5  left anti cw w>s in>out  right anti cw w>s in>out
 *   3 G beta5>beta3  left pro ccw s>e out>out right pro ccw s>e out>out
 *   4 H beta3>beta5  left anti ccw e>s out>in right anti ccw e>s out>in
 */
// prettier-ignore
export const GHGH: SequenceData = makeLoop("fx-ghgh", "GHGH", [
  makeStep(1, Letter.G, BETA5, BETA7, pro(CW, S, W, IN, IN), pro(CW, S, W, IN, IN)),
  makeStep(2, Letter.H, BETA7, BETA5, anti(CW, W, S, IN, OUT), anti(CW, W, S, IN, OUT)),
  makeStep(3, Letter.G, BETA5, BETA3, pro(CCW, S, E, OUT, OUT), pro(CCW, S, E, OUT, OUT)),
  makeStep(4, Letter.H, BETA3, BETA5, anti(CCW, E, S, OUT, IN), anti(CCW, E, S, OUT, IN)),
]);

/**
 * AAAA — counter-clockwise pro cycle through the alpha world (hands 180° apart).
 *
 * Step 1 is literal from Austen's FALG card:
 *   A alpha3>alpha1: left pro ccw w>s, right pro ccw e>n
 * The rest continues the location cycle left w→s→e→n→w with right always
 * opposite. Every alpha label was READ OFF `getGridPlacementFromLocations`.
 *
 * Its whole seam set is alpha; GGGG's is entirely beta. That disjointness is
 * what makes "AAAA + GGGG is impossible without a ΦΨ bridge" a real claim.
 */
// prettier-ignore
export const AAAA_CCW: SequenceData = makeLoop("fx-aaaa", "AAAA", [
  makeStep(1, Letter.A, ALPHA3, ALPHA1, pro(CCW, W, S, IN, IN), pro(CCW, E, N, IN, IN)),
  makeStep(2, Letter.A, ALPHA1, ALPHA7, pro(CCW, S, E, IN, IN), pro(CCW, N, W, IN, IN)),
  makeStep(3, Letter.A, ALPHA7, ALPHA5, pro(CCW, E, N, IN, IN), pro(CCW, W, S, IN, IN)),
  makeStep(4, Letter.A, ALPHA5, ALPHA3, pro(CCW, N, W, IN, IN), pro(CCW, S, E, IN, IN)),
]);

/**
 * FALG — Austen's 8-beat mirrored card, transcribed verbatim:
 *   1 F beta5>alpha3  left anti ccw s>w in>out   right pro ccw s>e in>in
 *   2 A alpha3>alpha1 left pro ccw w>s out>out   right pro ccw e>n in>in
 *   3 L alpha1>beta7  left anti ccw s>w out>in   right pro ccw n>w in>in
 *   4 G beta7>beta5   left pro ccw w>s in>in     right pro ccw w>s in>in
 *   5 F beta5>alpha3  left pro cw s>w in>in      right anti cw s>e in>out
 *   6 A alpha3>alpha5 left pro cw w>n in>in      right pro cw e>s out>out
 *   7 L alpha5>beta3  left pro cw n>e in>in      right anti cw s>e out>in
 *   8 G beta3>beta5   left pro cw e>s in>in      right pro cw e>s in>in
 *
 * The asymmetric fixture: it crosses alpha↔beta four times, uses four letters,
 * and its two halves are hand-role mirrors of each other. Rotations, mirrors and
 * hand swaps are OBSERVABLE on this one and invisible on the fully symmetric
 * cycles above — which is why Task 5+ needs it.
 */
// prettier-ignore
export const FALG: SequenceData = makeLoop("fx-falg", "FALG", [
  makeStep(1, Letter.F, BETA5, ALPHA3, anti(CCW, S, W, IN, OUT), pro(CCW, S, E, IN, IN)),
  makeStep(2, Letter.A, ALPHA3, ALPHA1, pro(CCW, W, S, OUT, OUT), pro(CCW, E, N, IN, IN)),
  makeStep(3, Letter.L, ALPHA1, BETA7, anti(CCW, S, W, OUT, IN), pro(CCW, N, W, IN, IN)),
  makeStep(4, Letter.G, BETA7, BETA5, pro(CCW, W, S, IN, IN), pro(CCW, W, S, IN, IN)),
  makeStep(5, Letter.F, BETA5, ALPHA3, pro(CW, S, W, IN, IN), anti(CW, S, E, IN, OUT)),
  makeStep(6, Letter.A, ALPHA3, ALPHA5, pro(CW, W, N, IN, IN), pro(CW, E, S, OUT, OUT)),
  makeStep(7, Letter.L, ALPHA5, BETA3, pro(CW, N, E, IN, IN), anti(CW, S, E, OUT, IN)),
  makeStep(8, Letter.G, BETA3, BETA5, pro(CW, E, S, IN, IN), pro(CW, E, S, IN, IN)),
]);

/**
 * ΦΨΦΨ — the 4-step ambient bridge loop. Every step is a Type-4 dash/static
 * pair, so it crosses alpha↔beta on every step and touches beta5, alpha5, beta1
 * and alpha1. This is the vocabulary the engine reaches for when two cards share
 * no seam (Task 10).
 *
 *   1 Φ beta5>alpha5  left dash s>n in>out    right static s>s in>in
 *   2 Ψ alpha5>beta1  left static n>n out>out right dash s>n in>out
 *   3 Φ beta1>alpha1  left dash n>s out>in    right static n>n out>out
 *   4 Ψ alpha1>beta5  left static s>s in>in   right dash n>s out>in
 */
// prettier-ignore
export const PHI_PSI_LOOP: SequenceData = makeLoop("fx-phi-psi", "ΦΨΦΨ", [
  makeStep(1, Letter.PHI, BETA5, ALPHA5, dash(NONE, S, N, IN, OUT), held(NONE, S, S, IN, IN)),
  makeStep(2, Letter.PSI, ALPHA5, BETA1, held(NONE, N, N, OUT, OUT), dash(NONE, S, N, IN, OUT)),
  makeStep(3, Letter.PHI, BETA1, ALPHA1, dash(NONE, N, S, OUT, IN), held(NONE, N, N, OUT, OUT)),
  makeStep(4, Letter.PSI, ALPHA1, BETA5, held(NONE, S, S, IN, IN), dash(NONE, N, S, OUT, IN)),
]);

/** Every loop fixture, named. */
export const ALL_FIXTURE_LOOPS: readonly (readonly [string, SequenceData])[] = [
  ["GGGG_CW", GGGG_CW],
  ["HHHH_CCW", HHHH_CCW],
  ["HHHH_CW", HHHH_CW],
  ["GHGH", GHGH],
  ["AAAA_CCW", AAAA_CCW],
  ["FALG", FALG],
  ["PHI_PSI_LOOP", PHI_PSI_LOOP],
];
