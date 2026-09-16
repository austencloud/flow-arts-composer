/**
 * Sequence Equivalence Detector Implementation
 *
 * Detects when two sequences are equivalent despite transforms:
 * 1. Spatial rotation (45° increments around the grid)
 * 2. Circular rotation (different starting beat in circular sequences)
 * 3. Combined transforms
 *
 * Detects when two sequences are equivalent despite transforms.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceCanonicalizer } from "./sequence-canonicalizer";

/**
 * Result of equivalence comparison
 */
export interface EquivalenceResult {
  readonly isEquivalent: boolean;
  readonly equivalenceType: EquivalenceType | null;
  readonly transform: TransformDetails | null;
}

/**
 * Types of equivalence supported
 */
export type EquivalenceType =
  | "identical"
  | "spatial-rotation"
  | "circular-rotation"
  | "combined";

/**
 * Details about the transform that makes sequences equivalent
 */
export interface TransformDetails {
  readonly spatialRotationSteps: number | null;
  readonly circularOffset: number | null;
  readonly gridModeToggled: boolean;
}

/**
 * Canonical signature for a sequence
 */
export interface SequenceSignature {
  readonly word: string;
  readonly stepCount: number;
  readonly isCircular: boolean;
  readonly beatSignatures: readonly LocalStepSignature[];
  readonly hash: string;
}

/**
 * Simplified rotation-invariant signature for a single beat (local to this detector)
 */
interface LocalStepSignature {
  readonly left: LocalMotionSignature;
  readonly right: LocalMotionSignature;
  readonly placementGroup: string;
}

/**
 * Simplified rotation-invariant signature for a single motion (local to this detector)
 */
interface LocalMotionSignature {
  readonly type: string;
  readonly direction: string;
  readonly turns: number | string;
  readonly orientationTransition: string;
}
import type { StepSignatureGenerator } from "./step-signature-generator";
import type { SpatialTransformDetector } from "./spatial-transform-detector";
import type { WordCyclicEquivalenceDetector } from "$lib/shared/foundation/utils/word-cyclic-equivalence-detector";
import type { MotionSignature, StepSignature } from "../domain/models/signatures";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";

export class SequenceEquivalenceDetector {
  constructor(
    private readonly sequenceCanonicalizer: SequenceCanonicalizer,
    private readonly stepSignatureGenerator: StepSignatureGenerator,
    private readonly spatialTransformDetector: SpatialTransformDetector,
    private readonly wordCyclicEquivalenceDetector: WordCyclicEquivalenceDetector
  ) {}

  areEquivalent(sequenceA: SequenceData, sequenceB: SequenceData): EquivalenceResult {
    // Quick rejection checks
    if (sequenceA.steps.length !== sequenceB.steps.length) {
      return this.notEquivalent();
    }

    if (sequenceA.steps.length === 0) {
      // Empty sequences are identical
      return this.identical();
    }

    // Check for identical sequences
    if (this.areIdentical(sequenceA, sequenceB)) {
      return this.identical();
    }

    // Check for circular rotation equivalence (same sequence, different start beat)
    if (sequenceA.isCircular && sequenceB.isCircular) {
      const circularResult = this.checkCircularRotation(sequenceA, sequenceB);
      if (circularResult.isEquivalent) {
        return circularResult;
      }
    }

    // Check for spatial rotation equivalence (same sequence, rotated around grid)
    const spatialResult = this.checkSpatialRotation(sequenceA, sequenceB);
    if (spatialResult.isEquivalent) {
      return spatialResult;
    }

    // Check for combined transforms (both circular and spatial)
    if (sequenceA.isCircular && sequenceB.isCircular) {
      const combinedResult = this.checkCombinedTransforms(sequenceA, sequenceB);
      if (combinedResult.isEquivalent) {
        return combinedResult;
      }
    }

    return this.notEquivalent();
  }

  generateSignature(sequence: SequenceData): SequenceSignature {
    const internalSig = this.sequenceCanonicalizer.generateSignature(sequence);

    // Convert internal signature to the interface's expected format
    return {
      word: internalSig.canonicalWord,
      stepCount: internalSig.stepCount,
      isCircular: internalSig.isCircular,
      beatSignatures: internalSig.beatSignatures.map((bs) =>
        this.convertStepSignature(bs)
      ),
      hash: internalSig.hash,
    };
  }

  normalizeRotation(sequence: SequenceData): SequenceData {
    // For now, return the sequence unchanged
    // Full implementation would rotate to a canonical spatial orientation
    // This is a placeholder that satisfies the interface
    return sequence;
  }

  findEquivalentSequences(
    target: SequenceData,
    candidates: readonly SequenceData[]
  ): readonly { sequence: SequenceData; equivalence: EquivalenceResult }[] {
    const results: { sequence: SequenceData; equivalence: EquivalenceResult }[] = [];

    // Generate target hash for quick filtering
    const targetHash = this.sequenceCanonicalizer.generateHash(target);

    for (const candidate of candidates) {
      // Skip if different length (quick rejection)
      if (candidate.steps.length !== target.steps.length) {
        continue;
      }

      // The canonical hash is a structural fingerprint (canonical word + step
      // count + circularity + per-beat signature hashes), not a lossy digest.
      // It already folds in circular rotation via the canonical word, so equal
      // hashes mean identical-or-circular-equivalent structure. When the hashes
      // differ, the identical and pure-circular paths in areEquivalent() cannot
      // possibly match (they would have produced an equal hash), so we skip them
      // and only run the rotation-based checks that legitimately bypass the hash:
      // spatial rotation, plus combined (circular + spatial) for circular pairs.
      // This is the fast-path skip that matters at 53k+ candidates.
      const candidateHash = this.sequenceCanonicalizer.generateHash(candidate);
      const equivalence =
        candidateHash === targetHash
          ? this.areEquivalent(target, candidate)
          : this.checkRotationEquivalence(target, candidate);

      if (equivalence.isEquivalent) {
        results.push({ sequence: candidate, equivalence });
      }
    }

    return results;
  }


  /**
   * Rotation-only equivalence used as the differing-hash fast path in
   * findEquivalentSequences. Runs the checks that bypass the canonical hash
   * (spatial rotation, and combined circular+spatial for circular pairs) while
   * skipping the identical and pure-circular checks, which a differing hash has
   * already ruled out.
   */
  private checkRotationEquivalence(
    seqA: SequenceData,
    seqB: SequenceData
  ): EquivalenceResult {
    if (seqA.steps.length !== seqB.steps.length) {
      return this.notEquivalent();
    }

    const spatialResult = this.checkSpatialRotation(seqA, seqB);
    if (spatialResult.isEquivalent) {
      return spatialResult;
    }

    if (seqA.isCircular && seqB.isCircular) {
      const combinedResult = this.checkCombinedTransforms(seqA, seqB);
      if (combinedResult.isEquivalent) {
        return combinedResult;
      }
    }

    return this.notEquivalent();
  }

  private areIdentical(seqA: SequenceData, seqB: SequenceData): boolean {
    if (seqA.word !== seqB.word) {
      return false;
    }

    // Compare each beat
    for (let i = 0; i < seqA.steps.length; i++) {
      const stepA = seqA.steps[i];
      const stepB = seqB.steps[i];

      if (!stepA || !stepB) {
        return false;
      }

      const leftA = stepA.motions[HandSide.LEFT];
      const rightA = stepA.motions[HandSide.RIGHT];
      const leftB = stepB.motions[HandSide.LEFT];
      const rightB = stepB.motions[HandSide.RIGHT];

      // Invisible placeholder = hand not really there (both-required Step shape).
      if (
        !isVisibleMotion(leftA) ||
        !isVisibleMotion(rightA) ||
        !isVisibleMotion(leftB) ||
        !isVisibleMotion(rightB)
      ) {
        return false;
      }

      // Compare locations
      if (
        leftA.startLocation !== leftB.startLocation ||
        leftA.endLocation !== leftB.endLocation ||
        rightA.startLocation !== rightB.startLocation ||
        rightA.endLocation !== rightB.endLocation
      ) {
        return false;
      }

      // Compare motion types
      if (leftA.motionType !== leftB.motionType || rightA.motionType !== rightB.motionType) {
        return false;
      }
    }

    return true;
  }

  private checkCircularRotation(
    seqA: SequenceData,
    seqB: SequenceData
  ): EquivalenceResult {
    const wordResult = this.wordCyclicEquivalenceDetector.areCyclicEquivalent(
      seqA.word,
      seqB.word
    );

    if (!wordResult.isEquivalent) {
      return this.notEquivalent();
    }

    const offset = wordResult.rotationOffset ?? 0;

    // Verify that the actual step data matches when rotated
    if (!this.verifyCircularRotation(seqA, seqB, offset)) {
      return this.notEquivalent();
    }

    return {
      isEquivalent: true,
      equivalenceType: "circular-rotation",
      transform: {
        spatialRotationSteps: null,
        circularOffset: offset,
        gridModeToggled: false,
      },
    };
  }

  private verifyCircularRotation(
    seqA: SequenceData,
    seqB: SequenceData,
    offset: number
  ): boolean {
    const len = seqA.steps.length;

    for (let i = 0; i < len; i++) {
      const stepA = seqA.steps[i];
      const stepBIndex = (i + offset) % len;
      const stepB = seqB.steps[stepBIndex];

      if (!stepA || !stepB) {
        return false;
      }

      const sigA = this.stepSignatureGenerator.generateSignature(stepA);
      const sigB = this.stepSignatureGenerator.generateSignature(stepB);

      if (!this.stepSignatureGenerator.signaturesMatch(sigA, sigB)) {
        return false;
      }
    }

    return true;
  }

  private checkSpatialRotation(
    seqA: SequenceData,
    seqB: SequenceData
  ): EquivalenceResult {
    // Try all 8 possible spatial rotations
    for (let rotationSteps = 1; rotationSteps < 8; rotationSteps++) {
      if (this.verifySpatialRotation(seqA, seqB, rotationSteps)) {
        return {
          isEquivalent: true,
          equivalenceType: "spatial-rotation",
          transform: {
            spatialRotationSteps: rotationSteps,
            circularOffset: null,
            gridModeToggled: rotationSteps % 2 === 1,
          },
        };
      }
    }

    return this.notEquivalent();
  }

  private verifySpatialRotation(
    seqA: SequenceData,
    seqB: SequenceData,
    rotationSteps: number
  ): boolean {
    for (let i = 0; i < seqA.steps.length; i++) {
      const stepA = seqA.steps[i];
      const stepB = seqB.steps[i];

      if (!stepA || !stepB) {
        return false;
      }

      if (!this.spatialTransformDetector.isRotationOf(stepA, stepB, rotationSteps)) {
        return false;
      }
    }

    return true;
  }

  private checkCombinedTransforms(
    seqA: SequenceData,
    seqB: SequenceData
  ): EquivalenceResult {
    // Try all combinations of circular offset and spatial rotation
    const len = seqA.steps.length;

    for (let circularOffset = 1; circularOffset < len; circularOffset++) {
      for (let spatialSteps = 0; spatialSteps < 8; spatialSteps++) {
        if (this.verifyCombinedTransform(seqA, seqB, circularOffset, spatialSteps)) {
          return {
            isEquivalent: true,
            equivalenceType: "combined",
            transform: {
              spatialRotationSteps: spatialSteps > 0 ? spatialSteps : null,
              circularOffset,
              gridModeToggled: spatialSteps % 2 === 1,
            },
          };
        }
      }
    }

    return this.notEquivalent();
  }

  private verifyCombinedTransform(
    seqA: SequenceData,
    seqB: SequenceData,
    circularOffset: number,
    spatialSteps: number
  ): boolean {
    const len = seqA.steps.length;

    for (let i = 0; i < len; i++) {
      const stepA = seqA.steps[i];
      const stepBIndex = (i + circularOffset) % len;
      const stepB = seqB.steps[stepBIndex];

      if (!stepA || !stepB) {
        return false;
      }

      // If spatial steps is 0, just compare signatures
      if (spatialSteps === 0) {
        const sigA = this.stepSignatureGenerator.generateSignature(stepA);
        const sigB = this.stepSignatureGenerator.generateSignature(stepB);
        if (!this.stepSignatureGenerator.signaturesMatch(sigA, sigB)) {
          return false;
        }
      } else {
        if (!this.spatialTransformDetector.isRotationOf(stepA, stepB, spatialSteps)) {
          return false;
        }
      }
    }

    return true;
  }

  private notEquivalent(): EquivalenceResult {
    return {
      isEquivalent: false,
      equivalenceType: null,
      transform: null,
    };
  }

  private identical(): EquivalenceResult {
    return {
      isEquivalent: true,
      equivalenceType: "identical",
      transform: {
        spatialRotationSteps: null,
        circularOffset: null,
        gridModeToggled: false,
      },
    };
  }

  /**
   * Convert internal StepSignature to the interface's expected format.
   */
  private convertStepSignature(internal: StepSignature): LocalStepSignature {
    return {
      left: this.convertMotionSignature(internal.left),
      right: this.convertMotionSignature(internal.right),
      placementGroup: internal.startPlacementGroup,
    };
  }

  /**
   * Convert internal MotionSignature to the interface's expected format.
   */
  private convertMotionSignature(internal: MotionSignature): LocalMotionSignature {
    return {
      type: internal.motionType,
      direction: internal.rotationDirection,
      turns: internal.turns,
      orientationTransition: `${internal.orientationTransition.from}→${internal.orientationTransition.to}`,
    };
  }
}
