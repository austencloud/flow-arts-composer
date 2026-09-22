import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  createMotionData,
  isVisibleMotion,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createPictographData } from "$lib/shared/pictograph/shared/domain/factories/create-pictograph-data";
import {
  MotionType,
  HandSide,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getSequenceMotionProfile } from "$lib/shared/foundation/services/sequence-motion-profile";
import type { SoloMotionHand } from "$lib/shared/foundation/services/sequence-motion-profile";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";

export class StartPlacementDeriver {
  deriveFromFirstStep(firstStep: StepData): StartPlacementData {
    const leftMotion = firstStep.motions?.[HandSide.LEFT];
    const rightMotion = firstStep.motions?.[HandSide.RIGHT];

    // Invisible placeholder = hand not really there (both-required Step shape).
    if (!isVisibleMotion(leftMotion) || !isVisibleMotion(rightMotion)) {
      throw new Error(
        "Cannot derive start position: first beat missing left or right motion"
      );
    }

    const leftStartLocation = leftMotion.startLocation;
    const rightStartLocation = rightMotion.startLocation;

    const gridPlacement = getGridPlacementFromLocations(
      leftStartLocation,
      rightStartLocation
    );

    const letter = this.getLetterFromGridPlacement(gridPlacement);

    const gridMode = leftMotion.gridMode;

    const leftStaticMotion = createMotionData({
      motionType: MotionType.STATIC,
      startLocation: leftStartLocation,
      endLocation: leftStartLocation,
      startOrientation: leftMotion.startOrientation,
      endOrientation: leftMotion.startOrientation,
      rotationDirection: RotationDirection.NO_ROTATION,
      turns: 0,
      hand: HandSide.LEFT,
      isVisible: true,
      propType: leftMotion.propType,
      arrowLocation: leftStartLocation,
      gridMode,
      ...(leftMotion.plane && { plane: leftMotion.plane }),
    });

    const rightStaticMotion = createMotionData({
      motionType: MotionType.STATIC,
      startLocation: rightStartLocation,
      endLocation: rightStartLocation,
      startOrientation: rightMotion.startOrientation,
      endOrientation: rightMotion.startOrientation,
      rotationDirection: RotationDirection.NO_ROTATION,
      turns: 0,
      hand: HandSide.RIGHT,
      isVisible: true,
      propType: rightMotion.propType,
      arrowLocation: rightStartLocation,
      gridMode,
      ...(rightMotion.plane && { plane: rightMotion.plane }),
    });

    const pictographData = createPictographData({
      id: `derived-start-${gridPlacement}`,
      letter,
      startPlacement: gridPlacement,
      endPlacement: gridPlacement,
      motions: {
        [HandSide.LEFT]: leftStaticMotion,
        [HandSide.RIGHT]: rightStaticMotion,
      },
    });

    return {
      ...pictographData,
      isStartPlacement: true,
      gridPlacement,
    } as StartPlacementData;
  }

  getOrDeriveStartPlacement(sequence: SequenceData): StartPlacementData | null {
    const profile = getSequenceMotionProfile(sequence);
    const isRenderable = (
      candidate: StartPlacementData | null | undefined
    ): candidate is StartPlacementData => {
      if (!candidate) return false;
      const leftVisible = isVisibleMotion(candidate.motions?.[HandSide.LEFT]);
      const rightVisible = isVisibleMotion(candidate.motions?.[HandSide.RIGHT]);
      if (profile.kind === "solo") {
        return profile.hand === HandSide.LEFT
          ? leftVisible && !rightVisible
          : rightVisible && !leftVisible;
      }
      return leftVisible && rightVisible;
    };

    if (isRenderable(sequence.startPlacement)) {
      return sequence.startPlacement;
    }

    if (isRenderable(sequence.startingPlacement)) {
      return sequence.startingPlacement;
    }

    const firstStep = sequence.steps?.[0];
    if (firstStep) {
      try {
        return profile.kind === "solo"
          ? this.deriveSoloFromFirstStep(firstStep, profile.hand)
          : this.deriveFromFirstStep(firstStep);
      } catch (error) {
        console.warn("Failed to derive start position from first beat:", error);
        return null;
      }
    }

    return null;
  }

  private deriveSoloFromFirstStep(
    firstStep: StepData,
    hand: SoloMotionHand
  ): StartPlacementData {
    const source = firstStep.motions?.[hand];
    if (!isVisibleMotion(source)) {
      throw new Error(
        `Cannot derive solo start position: first beat missing ${hand} motion`
      );
    }

    const staticMotion = createMotionData({
      ...source,
      motionType: MotionType.STATIC,
      rotationDirection: RotationDirection.NO_ROTATION,
      endLocation: source.startLocation,
      endOrientation: source.startOrientation,
      turns: 0,
      arrowLocation: source.startLocation,
      isVisible: true,
    });

    return createStartPlacementData({
      gridPlacement: null,
      motions: { [hand]: staticMotion },
    });
  }

  private getLetterFromGridPlacement(position: GridPlacement): Letter {
    const positionStr = position.toString().toLowerCase();

    if (positionStr.startsWith("alpha")) {
      return Letter.ALPHA;
    }
    if (positionStr.startsWith("beta")) {
      return Letter.BETA;
    }
    if (positionStr.startsWith("gamma")) {
      return Letter.GAMMA;
    }
    if (positionStr.startsWith("zeta")) {
      return Letter.ZETA;
    }
    if (positionStr.startsWith("eta")) {
      return Letter.ETA;
    }

    console.warn(
      `Unknown grid position type: ${position}, defaulting to ALPHA`
    );
    return Letter.ALPHA;
  }
}

export const startPlacementDeriver = new StartPlacementDeriver();
