/**
 * The LOOPs-only combinator: two cards in, a finite and complete taxonomy of
 * the LOOPs they make out.
 *
 * Four stages, each independently testable, all pure but for the dataset read:
 *
 *   1. **Vocabulary** — the two cards' letters, each contributing every one of
 *      its variations as an edge, plus the connectors (`unit-search.ts`).
 *   2. **Unit search** — exhaustive DFS inside a declared box (`unit-search.ts`).
 *   3. **Closure** — the app's own LOOP machinery decides which types each
 *      realized placement pair admits; anything admitting none is dropped
 *      (`loop-closure.ts`).
 *   4. **Present** — bucket by full circle count, group by closure inside the
 *      bucket (`circle-buckets.ts`).
 *
 * Between 2 and 3 sits the equivalence relation (`unit-canonicalizer.ts`), which
 * decides what counts as one discovery. Every number this file reports moves
 * with it, so it is reported alongside them.
 *
 * The counting convention: SHAPES at the top level, with words modulo orbit and
 * cyclic rotation as the drill-down. `rawUnitCount` is a realization count and
 * is diagnostic only — never a headline total.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

import type {
  CandidateUnit,
  CountBucket,
  LOOPCombination,
} from "../domain/closure-types";
import { bucketByCircleCount, expandClosures } from "./circle-buckets";
import type { ClosureOptions } from "./loop-closure";
import { buildResult } from "./splice-builder";
import { createUnitCanonicalizer, dedupeUnits } from "./unit-canonicalizer";
import {
  createClosurePredicate,
  loadCombinationSteps,
  searchCandidateUnits,
  type UnitSearchBox,
} from "./unit-search";

export interface LOOPCombinatorRequest {
  /** Card A's letters. A single-letter card is a one-element set. */
  readonly cardALetters: ReadonlySet<string>;
  readonly cardBLetters: ReadonlySet<string>;
  readonly gridMode?: GridMode;
  readonly box?: Partial<UnitSearchBox>;
  readonly closure?: ClosureOptions;
  /** Omit for "any letter belonging to neither card" — see `UnitSearchInput`. */
  readonly connectorLetters?: ReadonlySet<string> | null;
  /**
   * Supplied by a caller that already holds the alphabet (a test, a lab that
   * has loaded it once). Omitted, the dataset is read through the production
   * pipeline.
   */
  readonly steps?: readonly StepData[];
}

export interface LOOPCombinatorReport {
  /** One row per (unit, admissible closure), bucketed by full circle count. */
  readonly buckets: readonly CountBucket[];
  readonly combinations: readonly LOOPCombination[];
  /** One representative per discovery, after the equivalence relation. */
  readonly units: readonly CandidateUnit[];
  /**
   * The headline number. Distinct SHAPES across every result, ascending — the
   * altitude the answer is meant to be read at ("one shape, sixteen crossing
   * pairs, three run lengths"), with words as the drill-down beneath it and the
   * realization count nowhere near a headline.
   */
  readonly shapes: readonly string[];
  /** The same roll-up with run lengths dropped. See `CandidateUnit.shape`. */
  readonly shapeFamilies: readonly string[];
  /**
   * Closing walks before the equivalence relation — every phase and every
   * symmetric copy counted separately. Diagnostic: it answers "how much did the
   * search look at", never "how many combinations are there".
   */
  readonly rawUnitCount: number;
  /** The box the answer is complete WITHIN. There is no truncation. */
  readonly box: UnitSearchBox;
}

/** Run all four stages. */
export async function findLOOPCombinations(
  request: LOOPCombinatorRequest
): Promise<LOOPCombinatorReport> {
  const gridMode = request.gridMode ?? GridMode.DIAMOND;
  const steps = request.steps ?? (await loadCombinationSteps(gridMode));

  const closes = createClosurePredicate(request.closure ?? {});
  const raw = searchCandidateUnits(
    {
      steps,
      cardALetters: request.cardALetters,
      cardBLetters: request.cardBLetters,
      connectorLetters: request.connectorLetters ?? null,
      closes,
    },
    request.box ?? {}
  );

  const units = dedupeUnits(raw, createUnitCanonicalizer(steps));
  const combinations = expandClosures(units, request.closure ?? {});

  return {
    buckets: bucketByCircleCount(combinations),
    combinations,
    units,
    shapes: [...new Set(units.map((unit) => unit.shape))].sort(),
    shapeFamilies: [...new Set(units.map((unit) => unit.shapeFamily))].sort(),
    rawUnitCount: raw.length,
    box: {
      maxUnitLength: request.box?.maxUnitLength ?? 6,
      maxConnectors: request.box?.maxConnectors ?? 2,
      requireBothCards: request.box?.requireBothCards ?? true,
    },
  };
}

/**
 * A performable `SequenceData` for one combination's UNIT — the seed, not the
 * expanded circle.
 *
 * Reuses the splice builder, which re-derives the whole orientation chain from
 * a rebuilt start placement: a walk guarantees placement continuity and says
 * nothing about orientation, and a unit assembled from several cards' material
 * needs that pass before anyone can pick up two props. Expanding the seed into
 * its full circle is the LOOP executor's job, which takes this sequence plus the
 * closure's `loopType`/`period`.
 */
export async function buildUnitSequence(
  unit: CandidateUnit,
  frameCard: SequenceData
): Promise<SequenceData> {
  return buildResult(
    [
      {
        sourceId: "unit",
        kind: "cardA",
        startStepIndex: 0,
        steps: unit.steps,
        rotationFaithful: false,
      },
    ],
    frameCard
  );
}
