/**
 * Spell Service Loader
 *
 * Provides lazy-loaded access to spell-related services.
 * Uses direct singleton imports.
 */


import type { LetterTransitionGraph } from "./letter-transition-graph";
import type { WordSequenceGenerator } from "./word-sequence-generator";
import type { VariationConstraintBuilder } from "./variation-constraint-builder";
import type { RandomSequenceGenerator } from "./random-sequence-generator";
import type { SequenceExtender } from "../../shared/services/sequence-extender";

// Direct singleton imports
import { letterTransitionGraph as letterTransitionGraphSingleton } from "./letter-transition-graph";
import { wordSequenceGenerator as wordSequenceGeneratorSingleton } from "./word-sequence-generator";
import { variationConstraintBuilder as variationConstraintBuilderSingleton } from "./variation-constraint-builder";
import { randomSequenceGenerator as randomSequenceGeneratorSingleton } from "./random-sequence-generator";
import { sequenceExtender as sequenceExtenderSingleton } from "#lib/features/create/shared/services/sequence-extender.js";
import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";

export async function getWordGenerator(): Promise<WordSequenceGenerator> {
  return wordSequenceGeneratorSingleton;
}

export async function getTransitionGraph(): Promise<LetterTransitionGraph> {
  if (!letterTransitionGraphSingleton.isInitialized()) {
    // Set the letter query handler before initialization (required by LetterTransitionGraph)
    letterTransitionGraphSingleton.setLetterQueryHandler(letterQueryHandler);
    await letterTransitionGraphSingleton.initialize();
  }
  return letterTransitionGraphSingleton;
}

export async function getSequenceExtender(): Promise<SequenceExtender> {
  return sequenceExtenderSingleton;
}

export async function getVariationConstraintBuilder(): Promise<VariationConstraintBuilder> {
  return variationConstraintBuilderSingleton;
}

export async function getRandomSequenceGenerator(): Promise<RandomSequenceGenerator> {
  return randomSequenceGeneratorSingleton;
}
