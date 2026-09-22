import type {
  SequenceStep,
  MotionData,
} from "../../core/types/sequence-engine-types.js";
import { getInvertedLetter } from "../placement-maps/strict-loop-placement-maps.js";
import { translateHandPath } from "../placement-maps/circular-placement-maps.js";
import { gridPlacementDeriver } from "../../core/placements/GridPlacementDeriver.js";
import { updateStepOrientations } from "./orientation-helpers.js";

export interface FusedTransformFlags {
  readonly mirror: boolean;
  readonly flip: boolean;
  readonly swap: boolean;
  readonly invert: boolean;
  /** ROTATED is folded into this fused stage and must advance copy passes too. */
  readonly rotate?: boolean;
}

export class FusedExecutor {
  private readonly flipCount: number;
  private readonly spatialReflectionCount: number;

  constructor(private readonly flags: FusedTransformFlags) {
    let count = 0;
    if (flags.mirror) count++;
    if (flags.flip) count++;
    if (flags.invert) count++;
    this.flipCount = count;
    this.spatialReflectionCount = Number(flags.mirror) + Number(flags.flip);
  }

  execute(sequence: SequenceStep[], period: number): SequenceStep[] {
    const startPlacement = sequence.shift();
    if (!startPlacement)
      throw new Error("Sequence must have a start placement");

    const partialLength = sequence.length;
    const stepsToGenerate = partialLength * (period - 1);

    let lastStep = sequence[sequence.length - 1]!;
    const firstStepNumber = (lastStep.stepNumber ?? 0) + 1;

    for (let offset = 0; offset < stepsToGenerate; offset++) {
      const stepNumber = firstStepNumber + offset;
      const quarterIdx = Math.floor((stepNumber - 1) / partialLength);
      const sourceIdx = (stepNumber - 1) % partialLength;
      const applyTransform = quarterIdx % 2 === 1;

      const sourceStep = sequence[sourceIdx]!;

      const newStep = applyTransform
        ? this.createTransformedStep(sourceStep, lastStep, stepNumber)
        : this.createCopiedStep(sourceStep, lastStep, stepNumber);
      const finalStep = updateStepOrientations(newStep, lastStep);
      sequence.push(finalStep);
      lastStep = finalStep;
    }

    sequence.unshift(startPlacement);
    return sequence;
  }

  private createTransformedStep(
    sourceStep: SequenceStep,
    previousStep: SequenceStep,
    stepNumber: number
  ): SequenceStep {
    const leftSource = this.flags.swap
      ? sourceStep.motions.right
      : sourceStep.motions.left;
    const rightSource = this.flags.swap
      ? sourceStep.motions.left
      : sourceStep.motions.right;

    const leftMotion = this.transformMotion(
      leftSource,
      previousStep.motions.left
    );
    const rightMotion = this.transformMotion(
      rightSource,
      previousStep.motions.right
    );

    const endPlacement = gridPlacementDeriver.getGridPlacementFromLocations(
      leftMotion.endLocation,
      rightMotion.endLocation
    );

    // QR seeds omit derived letters. Their motion data still fully defines
    // inversion; the presentation boundary recovers a letter when it needs one.
    const letter =
      this.flags.invert && sourceStep.letter
        ? (getInvertedLetter(sourceStep.letter) as SequenceStep["letter"])
        : sourceStep.letter;

    return {
      ...sourceStep,
      stepNumber,
      letter,
      startPlacement:
        previousStep.endPlacement as SequenceStep["startPlacement"],
      endPlacement: endPlacement as SequenceStep["endPlacement"],
      motions: { left: leftMotion, right: rightMotion },
    };
  }

  private transformMotion(
    matchingMotion: MotionData,
    previousMotion: MotionData
  ): MotionData {
    const startLocation = previousMotion.endLocation;
    const endLocation = this.computeEndLocation(matchingMotion, startLocation);

    const flipRotDir = this.flipCount % 2 === 1;
    const rotationDirection = flipRotDir
      ? flipRotationDirection(matchingMotion.rotationDirection)
      : matchingMotion.rotationDirection;

    const motionType = this.flags.invert
      ? invertMotionType(matchingMotion.motionType)
      : matchingMotion.motionType;

    return {
      ...matchingMotion,
      // Swapped transforms borrow the opposite source motion, but the new
      // motion still belongs to the destination hand.
      hand: previousMotion.hand,
      startLocation: startLocation as MotionData["startLocation"],
      endLocation: endLocation as MotionData["endLocation"],
      rotationDirection: rotationDirection as MotionData["rotationDirection"],
      motionType: motionType as MotionData["motionType"],
      ...(matchingMotion.prefloatRotationDirection !== undefined && {
        prefloatRotationDirection: (flipRotDir
          ? flipRotationDirection(matchingMotion.prefloatRotationDirection)
          : matchingMotion.prefloatRotationDirection) as MotionData["rotationDirection"],
      }),
      ...(matchingMotion.prefloatMotionType !== undefined && {
        prefloatMotionType: (this.flags.invert
          ? invertMotionType(matchingMotion.prefloatMotionType)
          : matchingMotion.prefloatMotionType) as MotionData["motionType"],
      }),
    };
  }

  private computeEndLocation(
    matchingMotion: MotionData,
    startLocation: string
  ): string {
    if (matchingMotion.startLocation === matchingMotion.endLocation) {
      return startLocation;
    }

    return translateHandPath(
      matchingMotion.startLocation,
      matchingMotion.endLocation,
      startLocation,
      this.spatialReflectionCount % 2 === 1
    );
  }

  private createCopiedStep(
    sourceStep: SequenceStep,
    previousStep: SequenceStep,
    stepNumber: number
  ): SequenceStep {
    const leftMotion = this.copyMotion(
      sourceStep.motions.left,
      previousStep.motions.left
    );
    const rightMotion = this.copyMotion(
      sourceStep.motions.right,
      previousStep.motions.right
    );
    return {
      ...sourceStep,
      stepNumber,
      startPlacement:
        previousStep.endPlacement as SequenceStep["startPlacement"],
      endPlacement: gridPlacementDeriver.getGridPlacementFromLocations(
        leftMotion.endLocation,
        rightMotion.endLocation
      ) as SequenceStep["endPlacement"],
      motions: { left: leftMotion, right: rightMotion },
    };
  }

  private copyMotion(
    sourceMotion: MotionData,
    previousMotion: MotionData
  ): MotionData {
    const startLocation = previousMotion.endLocation;
    const endLocation = this.flags.rotate
      ? this.computeEndLocation(sourceMotion, startLocation)
      : sourceMotion.endLocation;
    return {
      ...sourceMotion,
      hand: previousMotion.hand,
      startLocation: startLocation as MotionData["startLocation"],
      endLocation: endLocation as MotionData["endLocation"],
    };
  }
}

function flipRotationDirection(dir: string): string {
  if (dir === "cw") return "ccw";
  if (dir === "ccw") return "cw";
  return dir;
}

function invertMotionType(motionType: string): string {
  if (motionType === "pro") return "anti";
  if (motionType === "anti") return "pro";
  return motionType;
}
