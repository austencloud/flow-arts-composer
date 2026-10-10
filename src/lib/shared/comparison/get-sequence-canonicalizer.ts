/**
 * The canonicalizer is PURE — it reads plain sequence data and returns a string
 * hash. It touches no DOM, no storage, no network, so the `browser` guard the
 * other getters in this folder carry never belonged here. It was removed when
 * the combination engine became this module's first real consumer (2026-08-04):
 * with the guard in place the browser took the canonicalizer path while every
 * unit test took the caller's fallback, so the shipped path was the untested one.
 */

import { SequenceCanonicalizer } from "./services/sequence-canonicalizer";
import { getStepSignatureGenerator } from "./get-step-signature-generator";
import * as wordCyclicEquivalenceDetector from "#lib/shared/foundation/utils/word-cyclic-equivalence-detector.js";

let instance: SequenceCanonicalizer | null = null;

export function getSequenceCanonicalizer(): SequenceCanonicalizer {
  return (instance ??= new SequenceCanonicalizer(
    getStepSignatureGenerator(),
    wordCyclicEquivalenceDetector
  ));
}
