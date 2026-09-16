/**
 * Compositional Decoder
 *
 * Decodes recipe-encoded sequences by reconstructing the full sequence
 * from a seed + LOOP executor. Verifies integrity via SHA-256 hash.
 *
 * Format: r1:{tag}:{hash}:{compressed seed}
 * - tag identifies the LOOP type (sr = rotated, etc.)
 * - hash is 8-char truncated SHA-256 of the full flat encoding
 * - compressed seed is deflate+base45 encoded flat encoding of just the seed beats
 *
 * Domain: QR - Compositional Encoding
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { RECIPE_PREFIX, TAG_TO_LOOP_TYPE } from "./types";
import type { ICompositionalDecoder } from "./types";
import {
  getLoopExecutor,
  getPeriodForTag,
  computeRecipeHash,
  enrichStepsWithGridPlacements,
} from "./compositional-utils";

export class CompositionalDecoder implements ICompositionalDecoder {
  constructor(
    private readonly flatEncoder: { encode(seq: SequenceData): string },
    private readonly flatDecoder: { decode(encoded: string): SequenceData },
    private readonly decompressor: {
      decompressString(s: string): string | null;
    }
  ) {}

  isRecipeEncoded(encoded: string): boolean {
    return encoded.startsWith(RECIPE_PREFIX);
  }

  async decode(recipeEncoded: string): Promise<string> {
    if (!recipeEncoded.startsWith(RECIPE_PREFIX)) {
      throw new Error("Not a recipe-encoded string");
    }

    // Parse: r1:{tag}:{hash}:{compressed seed}
    const withoutPrefix = recipeEncoded.slice(RECIPE_PREFIX.length);
    const firstColon = withoutPrefix.indexOf(":");
    const secondColon = withoutPrefix.indexOf(":", firstColon + 1);

    if (firstColon === -1 || secondColon === -1) {
      throw new Error("Invalid recipe format");
    }

    const tag = withoutPrefix.slice(0, firstColon);
    const expectedHash = withoutPrefix.slice(firstColon + 1, secondColon);
    const compressedSeed = withoutPrefix.slice(secondColon + 1);

    if (!TAG_TO_LOOP_TYPE[tag]) {
      throw new Error(`Unknown LOOP type tag: "${tag}"`);
    }

    // Decompress seed
    const seedEncoded = this.decompressor.decompressString(compressedSeed);
    if (!seedEncoded) {
      throw new Error("Failed to decompress seed data");
    }

    // Decode seed to SequenceData
    const seedSequence = this.flatDecoder.decode(seedEncoded);

    // Reconstruct full sequence using executor
    const executor = await getLoopExecutor(tag);
    if (!executor) {
      throw new Error(`No executor available for tag "${tag}"`);
    }

    const period = getPeriodForTag(tag);

    // Prepare input: executor expects start position at index 0, then seed beats.
    const inputSteps = [...(seedSequence.steps as StepData[])];

    // The flat encoder only preserves motion locations, not GridPlacement
    // fields (startPlacement/endPlacement). The executor needs these for
    // validation and position chaining. Derive them from motion locations.
    enrichStepsWithGridPlacements(inputSteps);

    const startPos =
      seedSequence.startPlacement ?? seedSequence.startingPlacement;
    if (startPos) {
      const startStep: StepData = createStepData({
        stepNumber: 0,
        motions: startPos.motions,
        duration: 1,
        isBlank: true,
        id: startPos.id ?? crypto.randomUUID(),
        letter: startPos.letter ?? null,
      });
      enrichStepsWithGridPlacements([startStep]);
      inputSteps.unshift(startStep);
    }

    const reconstructedSteps = executor.executeLOOP(inputSteps, period);

    // Separate start position back out
    const startPlacementStep = reconstructedSteps.shift();

    // Build reconstructed sequence
    const restoredStartPos = startPlacementStep
      ? createStartPlacementData({
          id: startPlacementStep.id,
          letter: startPlacementStep.letter,
          gridPlacement: startPlacementStep.startPlacement,
          startPlacement: startPlacementStep.startPlacement,
          endPlacement: startPlacementStep.endPlacement,
          motions: startPlacementStep.motions,
        })
      : undefined;

    const fullSequence: SequenceData = {
      ...seedSequence,
      steps: reconstructedSteps,
      word: this.expandWord(seedSequence.word || "", period),
      startPlacement: restoredStartPos ?? seedSequence.startPlacement,
      startingPlacement: restoredStartPos ?? seedSequence.startingPlacement,
    };

    // Single canonical format: hash the flat encoding directly.
    const flatEncoded = this.flatEncoder.encode(fullSequence);
    const actualHash = await computeRecipeHash(flatEncoded);

    if (actualHash !== expectedHash) {
      throw new Error(
        `Hash mismatch: expected ${expectedHash}, got ${actualHash}. ` +
          `Sequence may be corrupted.`
      );
    }

    // Return the verified flat encoding (caller will decode normally)
    return flatEncoded;
  }

  private expandWord(seedWord: string, period: string): string {
    const repeatCount = period === "quartered" ? 4 : 2;
    return seedWord.repeat(repeatCount);
  }
}
