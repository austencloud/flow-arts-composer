/**
 * Pure equivalence arithmetic over plain sequence data — no DOM, no storage, no
 * network (verified against `services/sequence-equivalence-detector.ts`, whose
 * only value imports are `HandSide`, `isVisibleMotion`, and
 * `findWordUnitsRotationOffset`). The `browser` guard was dropped with the
 * canonicalizer's (see `get-sequence-canonicalizer.ts`); this getter sits on
 * that dependency chain and carried the same split, where the browser took
 * the real path while every unit test took the caller's fallback.
 *
 * Note for callers: this detector reads `SequenceCanonicalizer`'s hash, which
 * carries three documented defects (cited on `contentDedupKey` in
 * `combination/services/walk-classifier.ts`). Its verdicts are only as sound as
 * that hash — the similarity calculator and the aligner do not depend on it.
 */

import { SequenceEquivalenceDetector } from "./services/sequence-equivalence-detector";
import { getSequenceCanonicalizer } from "./get-sequence-canonicalizer";
import { getStepSignatureGenerator } from "./get-step-signature-generator";
import { getSpatialTransformDetector } from "./get-spatial-transform-detector";

let instance: SequenceEquivalenceDetector | null = null;

export function getSequenceEquivalenceDetector(): SequenceEquivalenceDetector {
  return (instance ??= new SequenceEquivalenceDetector(
    getSequenceCanonicalizer(),
    getStepSignatureGenerator(),
    getSpatialTransformDetector()
  ));
}
