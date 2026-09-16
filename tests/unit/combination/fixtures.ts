/**
 * Ground-truth fixtures for the sequence-combination engine — the suite's view
 * of them.
 *
 * The cards themselves and the builder that constructs them now live in
 * `src/lib/shared/combination/domain/demo-fixtures.ts`, because the
 * `/test/sequence-combinator` lab loads the same known-good material as its
 * presets and a `tests/` module cannot be imported from `src/`. Nothing about
 * the data changed in the move; that file carries the full provenance and the
 * per-card transcriptions.
 *
 * What stays here is what only a test wants: the standalone bridge STEPS, the
 * seam reader, and the whole-corpus roll-ups that `fixtures.test.ts` asserts
 * over. Import from "./fixtures" exactly as before.
 */

import type { SeamState } from "$lib/shared/combination/domain/types";
import { seamOf } from "$lib/shared/combination/services/placement-groups";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

import {
  ALL_FIXTURE_LOOPS,
  PHI_PSI_LOOP,
} from "$lib/shared/combination/domain/demo-fixtures";

export {
  AAAA_CCW,
  ALL_FIXTURE_LOOPS,
  FALG,
  GGGG_CW,
  GHGH,
  HHHH_CCW,
  HHHH_CW,
  makeLoop,
  makeStep,
  PHI_PSI_LOOP,
  type MotionSpec,
} from "$lib/shared/combination/domain/demo-fixtures";

/**
 * Ψ alpha5>beta1 — verbatim: blue static n>n out>out, red dash s>n in>out.
 * Standalone bridge step; the same object as PHI_PSI_LOOP step 2.
 */
export const PSI_STEP: StepData = PHI_PSI_LOOP.steps[1]!;

/**
 * Φ beta5>alpha5 — verbatim: blue dash s>n in>out, red static s>s in>in.
 * Standalone bridge step; the same object as PHI_PSI_LOOP step 1.
 */
export const PHI_STEP: StepData = PHI_PSI_LOOP.steps[0]!;

/** The seam each step starts at, in order. */
export function seamsOf(seq: SequenceData): SeamState[] {
  return seq.steps.map((step) => {
    const seam = seamOf(step);
    if (!seam) {
      throw new Error(
        `Fixture step ${step.stepNumber} carries no startPlacement`
      );
    }
    return seam;
  });
}

/** Every fixture step, named, for whole-corpus assertions. */
export const ALL_FIXTURE_STEPS: readonly {
  readonly name: string;
  readonly step: StepData;
}[] = ALL_FIXTURE_LOOPS.flatMap(([name, seq]) =>
  seq.steps.map((step, i) => ({ name: `${name}[${i}]`, step }))
);
