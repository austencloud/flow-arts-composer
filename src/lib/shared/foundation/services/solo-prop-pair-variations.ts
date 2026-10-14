/**
 * Solo-prop pair variations — plain function module.
 *
 * One hand path, two hands. Given the solo-prop steps each hand performs for
 * a closed path (Zan's Diamond is the first customer), this builds the
 * two-hand sequences you get by staggering one hand in time, running one hand
 * backwards, or both. Every beat pairs the two hands into a placement and a
 * letter, so the result is an ordinary TKA word, not hand-path-only data.
 *
 * Reversal is the rotation-faithful kind `combination/services/variant-generator`
 * already uses: the hand retraces its locations backwards while the prop keeps
 * its rotation direction, so the motion type is re-derived (pro ↔ anti, dash
 * stays dash). Turns are then chosen so the prop keeps the orientations the
 * source step had (a record whose every beat is `out → out` stays that way).
 *
 * Pure: no fetch, no window. The letter lookup is injected so a script can
 * read the dataframe from disk and the app can use its loaded copy.
 */

import type { SoloPropStepData } from "../domain/models/solo-prop-step-data.js";
import {
  calculateEndOrientation,
  deriveMotionType,
} from "#lib/shared/render/core/calculations/orientation.js";
import { getGridPlacementFromLocations } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import type { GridPlacement } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type {
  MotionType,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export interface PairLetterQuery {
  readonly startPlacement: GridPlacement;
  readonly endPlacement: GridPlacement;
  readonly left: SoloPropStepData;
  readonly right: SoloPropStepData;
}

/** Resolve one beat to its dataframe letter, or null when no row matches. */
export type PairLetterLookup = (query: PairLetterQuery) => string | null;

export interface HandArrangement {
  readonly reversed: boolean;
  /** Which step of the (possibly reversed) path the hand starts on. */
  readonly offset: number;
}

export interface SoloPropPairVariation {
  /** Stable key, e.g. "right+3", "right-rev+0", "left-rev+5". */
  readonly id: string;
  readonly label: string;
  readonly left: HandArrangement;
  readonly right: HandArrangement;
}

export interface PairedBeat {
  readonly left: SoloPropStepData;
  readonly right: SoloPropStepData;
  readonly startPlacement: GridPlacement;
  readonly endPlacement: GridPlacement;
  readonly letter: string | null;
}

export interface SoloPropPairResult {
  readonly variation: SoloPropPairVariation;
  readonly beats: readonly PairedBeat[];
  /** Letters joined; an unresolved beat contributes "?" so the length is honest. */
  readonly word: string;
  /** 1-based beat numbers whose letter lookup failed. */
  readonly unresolvedBeats: readonly number[];
}

const TURN_CANDIDATES = [0, 1, 2, 3] as const;

function assertClosedPath(steps: readonly SoloPropStepData[]): void {
  const first = steps[0];
  const last = steps[steps.length - 1];
  if (!first || !last) {
    throw new Error("A solo-prop path needs at least one step");
  }
  if (last.endLocation !== first.startLocation) {
    throw new Error(
      `Stagger and reversal need a closed path; this one runs ${first.startLocation} → ${last.endLocation}`
    );
  }
}

/** Start the closed path on step `offset` instead of step 0. */
export function rotateSoloPropSteps(
  steps: readonly SoloPropStepData[],
  offset: number
): SoloPropStepData[] {
  assertClosedPath(steps);
  const n = steps.length;
  const shift = ((offset % n) + n) % n;
  return [...steps.slice(shift), ...steps.slice(0, shift)];
}

/**
 * Pick the smallest whole-turn count that lands the prop on `wantedEnd`.
 * Falls back to the source turns (and the orientation they really produce)
 * when no whole-turn count fits, so the step never lies about its end.
 */
function turnsPreservingOrientation(
  step: Pick<
    SoloPropStepData,
    "motionType" | "rotationDirection" | "startLocation" | "endLocation"
  >,
  startOrientation: Orientation,
  wantedEnd: Orientation,
  fallbackTurns: number | "fl"
): { turns: number | "fl"; endOrientation: Orientation } {
  if (fallbackTurns === "fl") {
    return { turns: "fl", endOrientation: wantedEnd };
  }
  for (const turns of TURN_CANDIDATES) {
    const end = calculateEndOrientation({
      motionType: step.motionType,
      turns,
      rotationDirection: step.rotationDirection,
      startLocation: step.startLocation,
      endLocation: step.endLocation,
      startOrientation,
    }) as Orientation;
    if (end === wantedEnd) return { turns, endOrientation: end };
  }
  const end = calculateEndOrientation({
    motionType: step.motionType,
    turns: fallbackTurns,
    rotationDirection: step.rotationDirection,
    startLocation: step.startLocation,
    endLocation: step.endLocation,
    startOrientation,
  }) as Orientation;
  return { turns: fallbackTurns, endOrientation: end };
}

/**
 * Rotation-faithful reversal of one hand: retrace the locations backwards,
 * keep the prop's rotation direction, re-derive the motion type, and keep the
 * source orientations by choosing the turns that reach them.
 */
export function reverseSoloPropSteps(
  steps: readonly SoloPropStepData[]
): SoloPropStepData[] {
  assertClosedPath(steps);
  return [...steps].reverse().map((step) => {
    const startLocation = step.endLocation;
    const endLocation = step.startLocation;
    const motionType = deriveMotionType(
      startLocation,
      endLocation,
      step.rotationDirection,
      step.turns
    ) as MotionType;
    const startOrientation = step.endOrientation;
    const { turns, endOrientation } = turnsPreservingOrientation(
      {
        motionType,
        rotationDirection: step.rotationDirection,
        startLocation,
        endLocation,
      },
      startOrientation,
      step.startOrientation,
      step.turns
    );
    return {
      ...step,
      startLocation,
      endLocation,
      motionType,
      turns,
      startOrientation,
      endOrientation,
      // A reversed shift arcs the other way; let the hydrator re-derive it.
      handPath: null,
    };
  });
}

export function arrangeSoloPropSteps(
  steps: readonly SoloPropStepData[],
  arrangement: HandArrangement
): SoloPropStepData[] {
  const oriented = arrangement.reversed ? reverseSoloPropSteps(steps) : steps;
  return rotateSoloPropSteps(oriented, arrangement.offset);
}

/** Pair two equal-length hand step lists beat by beat. */
export function pairSoloPropSteps(
  variation: SoloPropPairVariation,
  leftSteps: readonly SoloPropStepData[],
  rightSteps: readonly SoloPropStepData[],
  lookup: PairLetterLookup
): SoloPropPairResult {
  if (leftSteps.length !== rightSteps.length) {
    throw new Error(
      `Both hands must have the same step count (left ${leftSteps.length}, right ${rightSteps.length})`
    );
  }
  const left = arrangeSoloPropSteps(leftSteps, variation.left);
  const right = arrangeSoloPropSteps(rightSteps, variation.right);
  const unresolvedBeats: number[] = [];
  const beats = left.map((leftStep, i) => {
    const rightStep = right[i]!;
    const startPlacement = getGridPlacementFromLocations(
      leftStep.startLocation,
      rightStep.startLocation
    );
    const endPlacement = getGridPlacementFromLocations(
      leftStep.endLocation,
      rightStep.endLocation
    );
    const letter = lookup({
      startPlacement,
      endPlacement,
      left: leftStep,
      right: rightStep,
    });
    if (letter === null) unresolvedBeats.push(i + 1);
    return {
      left: leftStep,
      right: rightStep,
      startPlacement,
      endPlacement,
      letter,
    };
  });
  return {
    variation,
    beats,
    word: beats.map((beat) => beat.letter ?? "?").join(""),
    unresolvedBeats,
  };
}

function describeOffset(offset: number): string {
  return offset === 0 ? "in step" : `+${offset} beat${offset === 1 ? "" : "s"}`;
}

/**
 * Every stagger and per-hand reversal of one closed path, with the left hand
 * running forward from step 0 as the reference. Hand swap counts as distinct,
 * so the right hand leading by 3 and by 5 (the left leading by 3) both appear.
 *
 *   right+k      k = 1..n-1   right hand forward, k beats ahead
 *   right-rev+k  k = 0..n-1   right hand reversed, starting on its step k
 *   left-rev+k   k = 0..n-1   left hand reversed, starting on its step k
 */
export function enumerateStaggerAndReversalVariations(
  pathLength: number
): SoloPropPairVariation[] {
  const forward: HandArrangement = { reversed: false, offset: 0 };
  const variations: SoloPropPairVariation[] = [];
  for (let k = 1; k < pathLength; k++) {
    variations.push({
      id: `right+${k}`,
      label: `Right hand ${describeOffset(k)}`,
      left: forward,
      right: { reversed: false, offset: k },
    });
  }
  for (let k = 0; k < pathLength; k++) {
    variations.push({
      id: `right-rev+${k}`,
      label: `Right hand reversed, ${describeOffset(k)}`,
      left: forward,
      right: { reversed: true, offset: k },
    });
  }
  for (let k = 0; k < pathLength; k++) {
    variations.push({
      id: `left-rev+${k}`,
      label: `Left hand reversed, ${describeOffset(k)}`,
      left: { reversed: true, offset: k },
      right: forward,
    });
  }
  return variations;
}

function beatSignature(beat: PairedBeat): string {
  const hand = (s: SoloPropStepData) =>
    `${s.motionType}:${s.rotationDirection}:${s.startLocation}>${s.endLocation}`;
  return `${beat.startPlacement}>${beat.endPlacement}/${hand(beat.left)}/${hand(beat.right)}`;
}

/**
 * The same closed loop entered on a different beat is the same material. This
 * is the lexicographically smallest rotation of the beat signatures, equal for
 * two results iff one is a cyclic shift of the other.
 */
export function cyclicPairSignature(result: SoloPropPairResult): string {
  const keys = result.beats.map(beatSignature);
  let best = keys.join("|");
  for (let k = 1; k < keys.length; k++) {
    const rotated = [...keys.slice(k), ...keys.slice(0, k)].join("|");
    if (rotated < best) best = rotated;
  }
  return best;
}

/** Build every variation and drop any that is a cyclic shift of an earlier one. */
export function buildStaggerAndReversalVariations(
  leftSteps: readonly SoloPropStepData[],
  rightSteps: readonly SoloPropStepData[],
  lookup: PairLetterLookup
): SoloPropPairResult[] {
  const seen = new Set<string>();
  const results: SoloPropPairResult[] = [];
  for (const variation of enumerateStaggerAndReversalVariations(
    leftSteps.length
  )) {
    const result = pairSoloPropSteps(variation, leftSteps, rightSteps, lookup);
    const signature = cyclicPairSignature(result);
    if (seen.has(signature)) continue;
    seen.add(signature);
    results.push(result);
  }
  return results;
}
