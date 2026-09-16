/**
 * The sequences the prop-continuity sweep runs against.
 *
 * Two sets, both real:
 *
 * 1. The 19 core TnD motions. `scripts/seed-tnd-deck.ts` is the single
 *    canonical seeder for the `l1-tnd-motions` deck and its build path is pure
 *    (`DiamondPictographDataframe.csv` in, sequences out, no Firestore), so the
 *    corpus is built through it rather than transcribed. Its `TND_MOTIONS`
 *    table currently holds 22 entries: ids 1-19 are the original core set, and
 *    20-22 (PMPM/QNQN/RORO at gamma9) were added later by the gamma-split work
 *    and appear in no shipped card data. This corpus takes ids 1-19.
 *
 * 2. The seven demo fixtures, straight from `ALL_FIXTURE_LOOPS` - the same
 *    objects `lab-catalog.ts` keeps resolvable so an existing lab URL still
 *    loads. The lab pins the 19 above as its goal list; these remain its
 *    harness, and `fx-falg` is the only eight-step sequence in the corpus.
 */

import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { ALL_FIXTURE_LOOPS } from "$lib/shared/combination/domain/demo-fixtures";

import {
  loadCsv,
  buildTnDSequence,
  buildFirestoreStep,
  buildFirestoreStartPlacement,
  TND_MOTIONS,
} from "../../scripts/seed-tnd-deck";

/** Ids 1-19 of the seeder's table: the core set, before the gamma-split trio. */
export const CORE_TND_IDS = Array.from({ length: 19 }, (_, i) => i + 1);

export interface CorpusEntry {
  readonly id: string;
  readonly word: string;
  readonly group: "core-tnd" | "lab-fixture";
  readonly sequence: SequenceData;
}

function toSequenceData(
  id: string,
  word: string,
  startPlacement: ReturnType<typeof buildFirestoreStartPlacement>,
  steps: ReturnType<typeof buildFirestoreStep>[]
): SequenceData {
  return createSequenceData({
    id,
    name: word,
    word,
    steps: steps.map((step) =>
      createStepData({
        ...step,
        motions: {
          left: createMotionData(step.motions.left as never),
          right: createMotionData(step.motions.right as never),
        },
      } as never)
    ),
    startPlacement: createStartPlacementData({
      ...startPlacement,
      motions: {
        left: createMotionData(startPlacement.motions.left as never),
        right: createMotionData(startPlacement.motions.right as never),
      },
    } as never),
    isCircular: true,
    level: 1,
  } as never);
}

/** The 19 core TnD motions, built from the canonical dataframe. */
export function coreTnDCorpus(): CorpusEntry[] {
  const rows = loadCsv();
  return TND_MOTIONS.filter((def) => CORE_TND_IDS.includes(def.id)).map(
    (def) => {
      const built = buildTnDSequence(def, rows);
      const steps = built.beats.map((beat, index) =>
        buildFirestoreStep(beat, index + 1)
      );
      return {
        id: built.seqId,
        word: built.word,
        group: "core-tnd" as const,
        sequence: toSequenceData(
          built.seqId,
          built.word,
          buildFirestoreStartPlacement(built),
          steps
        ),
      };
    }
  );
}

/** The seven demo fixtures the staff-grip lab can still resolve. */
export function labFixtureCorpus(): CorpusEntry[] {
  return ALL_FIXTURE_LOOPS.map(([, sequence]) => ({
    id: sequence.id,
    word: sequence.word,
    group: "lab-fixture" as const,
    sequence,
  }));
}

export function propContinuityCorpus(): CorpusEntry[] {
  return [...coreTnDCorpus(), ...labFixtureCorpus()];
}
