/**
 * The equivalence relation. Every count the combinator publishes moves with
 * this file, so its three quotients are asserted directly rather than only
 * through the bucket profile.
 *
 * An earlier version of the research oracle omitted the gap-orbit quotient and
 * reported 512 words for A+G where the correct figure is 256 — a number that
 * looked plausible and came from the wrong relation.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { LOCATION_MAP_EIGHTH_CW } from "@tka/sequence-engine/loop";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import {
  GridMode,
  type GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { CandidateUnit } from "$lib/shared/combination/domain/closure-types";
import {
  createUnitCanonicalizer,
  dedupeUnits,
  motionTupleKey,
  type UnitCanonicalizer,
} from "$lib/shared/combination/services/unit-canonicalizer";
import {
  loadCombinationSteps,
  searchCandidateUnits,
} from "$lib/shared/combination/services/unit-search";

import { loadPictographDatasetForTests } from "./pictograph-dataset";

let steps: readonly StepData[];
let canonicalizer: UnitCanonicalizer;
let units: readonly CandidateUnit[];

beforeAll(async () => {
  await loadPictographDatasetForTests();
  steps = await loadCombinationSteps(GridMode.DIAMOND);
  canonicalizer = createUnitCanonicalizer(steps);
  units = searchCandidateUnits(
    {
      steps,
      cardALetters: new Set(["A"]),
      cardBLetters: new Set(["G"]),
    },
    { maxUnitLength: 4, maxConnectors: 2 }
  );
}, 60_000);

/** One hand's location, advanced `eighths` steps clockwise. */
function rotate(location: GridLocation, eighths: number): GridLocation {
  let current: string = location;
  for (let i = 0; i < eighths; i++) {
    current = LOCATION_MAP_EIGHTH_CW[current] ?? current;
  }
  return current as GridLocation;
}

/** The same closed unit, entered one step later. */
function rotatePhase(unit: CandidateUnit): readonly StepData[] {
  return [...unit.steps.slice(1), ...unit.steps.slice(0, 1)];
}

describe("the equivalence relation", () => {
  it("is blind to which step a closed unit is entered at", () => {
    const plain = units.find(
      (unit) => unit.startPlacement === unit.endPlacement && unit.steps.length > 1
    );
    expect(plain).toBeDefined();
    expect(canonicalizer.canonicalKey(rotatePhase(plain!))).toBe(
      canonicalizer.canonicalKey(plain!.steps)
    );
  });

  it("collapses a unit's gap-orbit faces onto one discovery", () => {
    // Rotating ONE hand by 90/180/270 walks every letter along its own family
    // in lockstep: EK+GG gives EKGG, NQSS, KEAA, QNSS — four faces, one loop,
    // identical reversal structure. One discovery, four presentations.
    //
    // The faces of an A+G unit carry gamma letters, so they never appear in the
    // A+G search at all; they have to be built to be tested. `motionTupleKey` is
    // the dataframe index key, which is all the construction needs.
    const byTuple = new Map<string, StepData>();
    for (const step of steps) {
      const key = motionTupleKey(step);
      if (!byTuple.has(key)) byTuple.set(key, step);
    }
    const rotateRed = (unit: CandidateUnit, eighths: number): StepData[] | null => {
      const rotated: StepData[] = [];
      for (const step of unit.steps) {
        const right = step.motions.right;
        const probe = createStepData({
          ...step,
          motions: {
            left: step.motions.left,
            right: {
              ...right,
              startLocation: rotate(right.startLocation, eighths),
              endLocation: rotate(right.endLocation, eighths),
            },
          },
        });
        const hit = byTuple.get(motionTupleKey(probe));
        if (!hit) return null;
        rotated.push(hit);
      }
      return rotated;
    };

    const found = units
      .map((unit) => ({ unit, face: rotateRed(unit, 2) }))
      .find(
        (entry) =>
          entry.face !== null &&
          canonicalizer.canonicalKey(entry.face) !==
            canonicalizer.canonicalKey(entry.unit.steps)
      );
    expect(found).toBeDefined();

    const { unit, face } = found!;
    // A face IS a different word — the same dance at a different hand gap.
    const faceWord = face!.map((step) => step.letter).join("");
    expect(faceWord).not.toBe(unit.word);
    expect(canonicalizer.orbitFaceKeys(unit.steps)).toContain(
      canonicalizer.canonicalKey(face!)
    );

    const faceUnit: CandidateUnit = {
      ...unit,
      steps: face!,
      word: faceWord,
      startPlacement: face![0]!.startPlacement!,
      endPlacement: face![face!.length - 1]!.endPlacement!,
    };
    expect(dedupeUnits([unit, faceUnit], canonicalizer)).toHaveLength(1);
  });

  it("keeps exactly one representative per class and loses nothing else", () => {
    const deduped = dedupeUnits(units, canonicalizer);
    expect(deduped.length).toBeLessThan(units.length);

    const keys = deduped.map((unit) => canonicalizer.canonicalKey(unit.steps));
    expect(new Set(keys).size).toBe(keys.length);

    // Every raw unit is still represented — by itself, by a symmetry, or by a
    // gap-orbit face.
    const covered = new Set<string>();
    for (const unit of deduped) {
      covered.add(canonicalizer.canonicalKey(unit.steps));
      for (const face of canonicalizer.orbitFaceKeys(unit.steps)) {
        covered.add(face);
      }
    }
    for (const unit of units) {
      expect(covered.has(canonicalizer.canonicalKey(unit.steps))).toBe(true);
    }
  });
});
