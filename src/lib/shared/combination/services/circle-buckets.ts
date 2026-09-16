/**
 * Stage 4 — Present. Buckets, and the metadata a row carries.
 *
 * **Circle length = unit length x the order of the closing transform.** Plain
 * closes in one pass; mirrored, flipped, swapped and 180-degree rotations take
 * two; 90 and 270 take four. So one 4-step unit is a 4-count, an 8-count or a
 * 16-count depending only on how it closes, and a unit appears in several
 * buckets — once per admissible closure. Grouping by circle count first and by
 * LOOP type within it sorts the answer into the counts a performer actually
 * thinks in, which is the primary organisation the design asks for.
 *
 * The displayed word is always the smallest repeating unit
 * (`simplifyRepeatedWord`, `.claude/rules/simplified-word-display.md`): AAAA
 * reads as A, and a raw repeated word never reaches a human.
 */

import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { betaDetector } from "$lib/shared/pictograph/prop/services/beta-detector";
import { SequenceAnalyzer } from "$lib/features/create/shared/services/sequence-analyzer";
import { SequenceFeatureExtractor } from "$lib/features/loop-labeler/services/sequence-feature-extractor";
import type { SequenceFeatures } from "$lib/features/loop-labeler/domain/models/sequence-features";

import type {
  CandidateUnit,
  CountBucket,
  LOOPCombination,
} from "../domain/closure-types";
import { admissibleClosures, type ClosureOptions } from "./loop-closure";

/**
 * Expand each unit into one row per admissible closure.
 *
 * A unit whose closure list is empty contributes nothing: freeform closures are
 * discarded, not demoted (the redesign's first settled decision).
 */
export function expandClosures(
  units: readonly CandidateUnit[],
  options: ClosureOptions = {}
): readonly LOOPCombination[] {
  const combinations: LOOPCombination[] = [];
  for (const unit of units) {
    const displayWord = simplifyRepeatedWord(unit.word);
    for (const closure of admissibleClosures(
      unit.startPlacement,
      unit.endPlacement,
      options
    )) {
      combinations.push({
        unit,
        closure,
        circleCount: unit.steps.length * closure.circleMultiplier,
        displayWord,
      });
    }
  }
  return combinations;
}

/** Group by full circle count ascending, then by closure within each bucket. */
export function bucketByCircleCount(
  combinations: readonly LOOPCombination[]
): readonly CountBucket[] {
  const byCount = new Map<number, LOOPCombination[]>();
  for (const combination of combinations) {
    const list = byCount.get(combination.circleCount);
    if (list) list.push(combination);
    else byCount.set(combination.circleCount, [combination]);
  }

  return [...byCount.entries()]
    .sort(([a], [b]) => a - b)
    .map(([count, list]) => {
      const byClosure = new Map<string, LOOPCombination[]>();
      const words = new Set<string>();
      for (const combination of list) {
        words.add(combination.displayWord);
        const bucket = byClosure.get(combination.closure.id);
        if (bucket) bucket.push(combination);
        else byClosure.set(combination.closure.id, [combination]);
      }
      return {
        count,
        combinations: list,
        byClosure,
        words: [...words],
      };
    });
}

/**
 * The features a result row is sorted and filtered by: motion-type mix, gap
 * (alpha/beta/gamma) presence, turns, reversals, circularity, grid mode.
 *
 * This is `SequenceFeatureExtractor.extractFeatures`, unchanged. An earlier
 * spec claimed nothing analysed a finished sequence for motion-type content and
 * scheduled a new classifier; that claim was wrong and the classifier is not
 * built here.
 *
 * The extractor is pure over `SequenceData`, so it is constructed directly
 * rather than through `getSequenceFeatureExtractor()` — that getter's browser
 * gate governs singleton lifetime in the app, and the combinator's Stage 4 has
 * to run under the test runner too.
 */
let extractor: SequenceFeatureExtractor | null = null;

export function describeCombination(sequence: SequenceData): SequenceFeatures {
  extractor ??= new SequenceFeatureExtractor(new SequenceAnalyzer(betaDetector));
  return extractor.extractFeatures(sequence);
}
