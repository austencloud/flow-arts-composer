/**
 * The equivalence relation. Two candidate units are the same discovery when
 * this file says they are, and every count the combinator reports moves with
 * that decision — so it is stated here once, in one place, rather than implied
 * by a dedup key somewhere downstream.
 *
 * Three quotients, applied in this order:
 *
 *   1. **Whole-unit symmetry.** The D4 x hand-swap group acting on both
 *      hands' locations: four quarter rotations, an optional reflection, an
 *      optional left/right swap. A loop and its rotated/mirrored/hand-swapped
 *      selves are one idea.
 *   2. **Cyclic rotation.** A closed unit has no first step; entering it at a
 *      different step is the same loop. (Necklace-minimal string.)
 *   3. **The gap orbit.** Rotating ONE hand by 90/180/270 walks every letter
 *      along its gap family in lockstep — EKGG, NQSS, KEAA, QNSS are four faces
 *      of one loop, with identical reversal structure. One discovery, four
 *      presentations (`docs/reference/letter-gap-families.md`).
 *
 * An earlier version of the research oracle omitted quotient 3 and reported 512
 * words for A+G where the correct figure is 256. A count that looks plausible is
 * not evidence it came from the right relation; whenever a number is published,
 * this list is published with it.
 *
 * The lookup key throughout is the full eight-field motion tuple (each hand's
 * motion type, rotation direction, start location and end location). That key is
 * what reproduces the 13 letter-gap families exactly; if a reimplementation does
 * not reproduce them, the key is wrong.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  LOCATION_MAP_EIGHTH_CW,
  VERTICAL_MIRROR_LOCATION_MAP,
} from "@tka/sequence-engine/loop";

import type { CandidateUnit } from "../domain/closure-types";

/** One eighth-turn clockwise, applied `steps` times. Identity for 0. */
function rotateLocation(location: string, eighths: number): string {
  let current = location;
  for (let i = 0; i < ((eighths % 8) + 8) % 8; i++) {
    current = LOCATION_MAP_EIGHTH_CW[current] ?? current;
  }
  return current;
}

function mirrorLocation(location: string): string {
  return VERTICAL_MIRROR_LOCATION_MAP[location] ?? location;
}

/** A symmetry of the whole unit: rotate by `quarters`, optionally reflect, optionally swap hands. */
interface SymmetryOp {
  readonly quarters: 0 | 1 | 2 | 3;
  readonly reflect: boolean;
  readonly swap: boolean;
}

const SYMMETRY_OPS: readonly SymmetryOp[] = (() => {
  const ops: SymmetryOp[] = [];
  for (const quarters of [0, 1, 2, 3] as const) {
    for (const reflect of [false, true]) {
      for (const swap of [false, true]) ops.push({ quarters, reflect, swap });
    }
  }
  return ops;
})();

function transformLocation(location: string, op: SymmetryOp): string {
  return rotateLocation(
    op.reflect ? mirrorLocation(location) : location,
    op.quarters * 2
  );
}

/** motionType, rotationDirection, startLocation, endLocation — the identity of a hand's move. */
function handFields(motion: MotionData): readonly [string, string] {
  return [String(motion.motionType), String(motion.rotationDirection)];
}

/**
 * The eight-field tuple of one step under a symmetry.
 *
 * Under a hand swap the hands exchange wholesale: the new left hand carries
 * the old right hand's motion type and rotation direction as well as its
 * locations. Transforming only the locations would describe a step nobody can
 * perform.
 */
function stepKey(step: StepData, op: SymmetryOp): string {
  const left = step.motions.left;
  const right = step.motions.right;
  const first = op.swap ? right : left;
  const second = op.swap ? left : right;
  return [
    ...handFields(first),
    transformLocation(String(first.startLocation), op),
    transformLocation(String(first.endLocation), op),
    ...handFields(second),
    transformLocation(String(second.startLocation), op),
    transformLocation(String(second.endLocation), op),
  ].join("|");
}

/** Lexicographically smallest cyclic rotation — the necklace representative. */
function necklace(keys: readonly string[]): string {
  let best: string | null = null;
  for (let i = 0; i < keys.length; i++) {
    const rotated = [...keys.slice(i), ...keys.slice(0, i)].join("::");
    if (best === null || rotated < best) best = rotated;
  }
  return best ?? "";
}

/** The untransformed eight-field tuple — the index key into the dataframe. */
export function motionTupleKey(step: StepData): string {
  const left = step.motions.left;
  const right = step.motions.right;
  return [
    ...handFields(left),
    String(left.startLocation),
    String(left.endLocation),
    ...handFields(right),
    String(right.startLocation),
    String(right.endLocation),
  ].join("|");
}

export interface UnitCanonicalizer {
  /** Quotients 1 and 2: the unit's identity up to whole-unit symmetry and phase. */
  canonicalKey(steps: readonly StepData[]): string;
  /**
   * Quotient 3: the canonical keys of the unit's other gap-orbit faces.
   *
   * A face exists only when EVERY step of the rotated unit is a real row of the
   * dataframe. Faces that fall off the shipped map (which is every 45-degree
   * face — skew has no rows starting from a skewed placement) are simply absent.
   */
  orbitFaceKeys(steps: readonly StepData[]): readonly string[];
}

/**
 * @param allSteps every pictograph of the grid mode being searched, as steps.
 *        The orbit lookup needs the WHOLE alphabet, not the search vocabulary:
 *        rotating one hand carries A onto S, and S may be in no card.
 */
export function createUnitCanonicalizer(
  allSteps: readonly StepData[]
): UnitCanonicalizer {
  const byTuple = new Map<string, StepData>();
  for (const step of allSteps) {
    const key = motionTupleKey(step);
    if (!byTuple.has(key)) byTuple.set(key, step);
  }

  const canonicalKey = (steps: readonly StepData[]): string => {
    let best: string | null = null;
    for (const op of SYMMETRY_OPS) {
      const key = necklace(steps.map((step) => stepKey(step, op)));
      if (best === null || key < best) best = key;
    }
    return best ?? "";
  };

  return {
    canonicalKey,
    orbitFaceKeys(steps) {
      const faces: string[] = [];
      for (const eighths of [2, 4, 6]) {
        const rotated: StepData[] = [];
        let complete = true;
        for (const step of steps) {
          const left = step.motions.left;
          const right = step.motions.right;
          const key = [
            ...handFields(left),
            String(left.startLocation),
            String(left.endLocation),
            ...handFields(right),
            rotateLocation(String(right.startLocation), eighths),
            rotateLocation(String(right.endLocation), eighths),
          ].join("|");
          const hit = byTuple.get(key);
          if (!hit) {
            complete = false;
            break;
          }
          rotated.push(hit);
        }
        if (complete) faces.push(canonicalKey(rotated));
      }
      return faces;
    },
  };
}

/**
 * Collapse a raw candidate list to one representative per discovery.
 *
 * Two passes, because the quotients are not the same shape: symmetry and phase
 * give a canonical KEY (cheap, total), while the orbit gives a set of OTHER
 * keys that must be struck off once a representative has been chosen.
 */
export function dedupeUnits(
  units: readonly CandidateUnit[],
  canonicalizer: UnitCanonicalizer
): readonly CandidateUnit[] {
  const bySymmetry = new Map<string, CandidateUnit>();
  for (const unit of units) {
    const key = canonicalizer.canonicalKey(unit.steps);
    if (!bySymmetry.has(key)) bySymmetry.set(key, unit);
  }

  const claimed = new Set<string>();
  const representatives: CandidateUnit[] = [];
  for (const [key, unit] of bySymmetry) {
    if (claimed.has(key)) continue;
    claimed.add(key);
    for (const face of canonicalizer.orbitFaceKeys(unit.steps)) {
      claimed.add(face);
    }
    representatives.push(unit);
  }
  return representatives;
}
