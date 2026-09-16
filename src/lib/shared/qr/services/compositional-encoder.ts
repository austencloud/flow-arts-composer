/**
 * Compositional Encoder
 *
 * Tries to encode a sequence as a recipe (seed + transformation tag)
 * instead of all beats. This produces significantly smaller QR codes
 * for LOOP sequences (~65% smaller for quartered rotations).
 *
 * The encoder:
 * 1. Runs LOOPDetector to identify the pattern
 * 2. Extracts the seed beats (first quarter or half)
 * 3. Reconstructs from seed using the executor (round-trip verification)
 * 4. If reconstruction matches original, produces recipe string with hash
 * 5. If mismatch, returns null (caller falls back to flat encoding)
 *
 * Domain: QR - Compositional Encoding
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { getLoopDetector } from "$lib/shared/create/get-loop-detector";
import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { LOOP_TYPE_TAGS, RECIPE_PREFIX } from "./types";
import {
  getLoopExecutor,
  getPeriodForTag,
  computeRecipeHash,
  enrichStepsWithGridPlacements,
} from "./compositional-utils";

export class CompositionalEncoder {
  constructor(
    private readonly flatEncoder: { encode(seq: SequenceData): string },
    private readonly flatDecoder: { decode(encoded: string): SequenceData },
    private readonly compressor: { compressString(s: string): string }
  ) {}

  async tryEncode(
    flatEncoded: string,
    sequence: SequenceData
  ): Promise<string | null> {
    if (!sequence.steps || sequence.steps.length < 4) return null;

    // Step 1: Detect LOOP pattern
    const detection = getLoopDetector().detectLOOPType(sequence);

    if (!detection.loopType || detection.confidence !== "strict") return null;

    // Step 2: Get the tag for this LOOP type.
    // Compound LOOP types (swapped_inverted, rotated_swapped, etc.) won't
    // have an entry in LOOP_TYPE_TAGS and will return null here. This is
    // intentional - compound types fall back to flat encoding per the spec.
    const loopTypeValue = String(detection.loopType);
    const tag = LOOP_TYPE_TAGS[loopTypeValue];
    if (!tag) return null;

    // Step 3: Determine period.
    // For rotated LOOPs, the detector returns the period directly.
    // For non-rotated LOOPs (mirrored, flipped, etc.), period is null
    // in the detection result - they're always HALVED.
    const period = detection.period ?? Period.HALVED;

    // Step 4: Extract seed beats
    const seedSize =
      period === Period.QUARTERED
        ? Math.floor(sequence.steps.length / 4)
        : Math.floor(sequence.steps.length / 2);
    const seedSteps = sequence.steps.slice(0, seedSize);

    // Step 5: Create a seed-only sequence for encoding
    const seedSequence: SequenceData = {
      ...sequence,
      steps: seedSteps as StepData[],
      word: this.extractSeedWord(
        sequence.word || "",
        seedSize,
        sequence.steps.length
      ),
    };
    const seedEncoded = this.flatEncoder.encode(seedSequence);

    // Step 6: Round-trip verify - reconstruct from seed and compare.
    // Audit fix #6: hash is computed on uncompressed flat encoding (this.encode),
    // not on the compressed version (this.encodeWithCompression).
    const reconstructed = await this.reconstruct(seedEncoded, tag, sequence);
    if (!reconstructed) return null;

    const reconstructedFlat = this.flatEncoder.encode(reconstructed);
    if (reconstructedFlat !== flatEncoded) {
      return null;
    }

    // Step 7: Compute hash of the uncompressed flat encoding
    const hash = await computeRecipeHash(flatEncoded);

    // Step 8: Compress the seed and build recipe string
    const compressedSeed = this.compressor.compressString(seedEncoded);
    return `${RECIPE_PREFIX}${tag}:${hash}:${compressedSeed}`;
  }

  /**
   * Reconstruct full sequence from seed encoding + LOOP type tag.
   * Uses the pre-wired singleton executors from the generate module.
   */
  private async reconstruct(
    seedEncoded: string,
    tag: string,
    originalSequence: SequenceData
  ): Promise<SequenceData | null> {
    try {
      const seedSequence = this.flatDecoder.decode(seedEncoded);
      const executor = await getLoopExecutor(tag);
      if (!executor) return null;

      const period = getPeriodForTag(tag);

      // executeLOOP mutates the input array, so spread a copy.
      // It expects the start position at index 0, then seed beats.
      const inputSteps = [...(seedSequence.steps as StepData[])];

      // The flat encoder only preserves motion locations, not GridPlacement
      // fields (startPlacement/endPlacement). The executor needs these for
      // validation and position chaining. Derive them from motion locations.
      enrichStepsWithGridPlacements(inputSteps);

      // If the decoded seed has a startPlacement/startingPlacement,
      // we need to prepend it as step 0 for the executor.
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
        // Derive GridPlacement from motion locations for the start step too
        enrichStepsWithGridPlacements([startStep]);
        inputSteps.unshift(startStep);
      }

      const reconstructedSteps = executor.executeLOOP(inputSteps, period);

      // The executor returns steps WITH the start position at index 0.
      // Separate them back out to match the original structure.
      const startPlacementStep = reconstructedSteps.shift();

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

      return {
        ...originalSequence,
        steps: reconstructedSteps,
        startPlacement: restoredStartPos ?? originalSequence.startPlacement,
        startingPlacement: restoredStartPos ?? originalSequence.startingPlacement,
      };
    } catch {
      // Recipe encoding is opportunistic. A detector candidate can still fail
      // the executor's stricter reconstruction checks; returning null asks the
      // caller to use the lossless flat encoding.
      return null;
    }
  }

  private extractSeedWord(
    fullWord: string,
    seedSize: number,
    totalSteps: number
  ): string {
    if (!fullWord || totalSteps === 0) return fullWord;
    const charPerBeat = fullWord.length / totalSteps;
    return fullWord.slice(0, Math.ceil(seedSize * charPerBeat));
  }
}
