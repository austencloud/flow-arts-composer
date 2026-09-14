import { GridMode } from "../domain/enums/grid-enums";
import type { GridLocation } from "../domain/enums/grid-enums";
import type { PlacementGridPoint } from "./placement-grid-points";
import { getPlacementGridPoints } from "./placement-grid-points";
import type { PropType } from "../../prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "../../shared/domain/enums/pictograph-enums";
import type { PictographData } from "../../shared/domain/models/pictograph-data";
import { createMotionData } from "../../shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  calculateBetaOffset,
  type BetaMotionInput,
} from "$lib/shared/render/core/calculations/beta-offset";

export interface PlacementPromptParts {
  lead: string;
  noun: string;
  color: HandSide;
  aim: string | null;
}

interface PlacementPromptInput {
  disabled: boolean;
  isComplete: boolean;
  canAim: boolean;
  activeHand: HandSide | null;
  dragHand: HandSide | null;
  dragAim: Orientation | null;
  hoverHand: HandSide | null;
  leftLocation: GridLocation | null;
  rightLocation: GridLocation | null;
  leftNoun: string;
  rightNoun: string;
}

const AIM_LABELS: Partial<Record<Orientation, string>> = {
  [Orientation.IN]: "In",
  [Orientation.OUT]: "Out",
  [Orientation.CLOCK]: "Clock",
  [Orientation.COUNTER]: "Counter",
  [Orientation.CENTER_N]: "North",
  [Orientation.CENTER_NE]: "Northeast",
  [Orientation.CENTER_E]: "East",
  [Orientation.CENTER_SE]: "Southeast",
  [Orientation.CENTER_S]: "South",
  [Orientation.CENTER_SW]: "Southwest",
  [Orientation.CENTER_W]: "West",
  [Orientation.CENTER_NW]: "Northwest",
};

export function buildPlacementPrompt(input: PlacementPromptInput): {
  parts: PlacementPromptParts | null;
  text: string;
} {
  const build = (
    noun: string,
    color: HandSide,
    lead: string,
    aim: string | null = null
  ): PlacementPromptParts => ({ lead, noun, color, aim });

  let parts: PlacementPromptParts | null = null;

  if (!input.disabled) {
    if (input.dragHand !== null && input.dragAim !== null) {
      const noun =
        input.dragHand === HandSide.LEFT ? input.leftNoun : input.rightNoun;
      parts = build(
        noun,
        input.dragHand,
        "Aiming the",
        AIM_LABELS[input.dragAim] ?? null
      );
    } else if (input.activeHand === null && input.hoverHand !== null) {
      const noun =
        input.hoverHand === HandSide.LEFT ? input.leftNoun : input.rightNoun;
      parts = build(noun, input.hoverHand, "Drag to aim the");
    } else if (input.activeHand === HandSide.LEFT) {
      parts = build(
        input.leftNoun,
        HandSide.LEFT,
        input.leftLocation !== null
          ? "Choose a new location for the"
          : input.canAim
            ? "Press a point and drag to aim the"
            : "Place the"
      );
    } else if (input.activeHand === HandSide.RIGHT) {
      parts = build(
        input.rightNoun,
        HandSide.RIGHT,
        input.rightLocation !== null
          ? "Choose a new location for the"
          : input.canAim
            ? "Press a point and drag to aim the"
            : "Place the"
      );
    }
  }

  const text = parts
    ? `${parts.lead} ${parts.noun}${parts.aim ? `: ${parts.aim}` : ""}`
    : !input.disabled && input.isComplete
      ? input.canAim
        ? "Drag a prop to aim it"
        : "Position ready"
      : "";

  return { parts, text };
}

interface PlacementPictographInput {
  gridMode: GridMode;
  leftLocation: GridLocation | null;
  rightLocation: GridLocation | null;
  leftOrientation: Orientation;
  rightOrientation: Orientation;
  leftPropType: PropType;
  rightPropType: PropType;
  betaSwapped: boolean;
  previewPictographData: StepData | PictographData | null;
}

function buildMotion(
  location: GridLocation,
  color: HandSide,
  orientation: Orientation,
  propType: PropType,
  gridMode: GridMode
) {
  return createMotionData({
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: location,
    endLocation: location,
    turns: 0,
    startOrientation: orientation,
    endOrientation: orientation,
    isVisible: true,
    propType,
    arrowLocation: location,
    hand: color,
    gridMode,
  });
}

export function buildPlacementPictographData(
  input: PlacementPictographInput
): PictographData {
  const motions: PictographData["motions"] = {};

  if (input.leftLocation) {
    motions[HandSide.LEFT] = buildMotion(
      input.leftLocation,
      HandSide.LEFT,
      input.leftOrientation,
      input.leftPropType,
      input.gridMode
    );
  }
  if (input.rightLocation) {
    motions[HandSide.RIGHT] = buildMotion(
      input.rightLocation,
      HandSide.RIGHT,
      input.rightOrientation,
      input.rightPropType,
      input.gridMode
    );
  }

  return {
    ...(input.previewPictographData ?? {}),
    id: input.previewPictographData?.id ?? "shared-prop-placement-grid",
    letter: input.previewPictographData?.letter ?? null,
    startPosition: input.previewPictographData?.startPosition ?? null,
    endPosition: input.previewPictographData?.endPosition ?? null,
    gridMode: input.gridMode,
    betaSwapped: input.betaSwapped,
    motions,
  } satisfies PictographData;
}

export interface PlacementTransitionInput {
  gridMode: GridMode;
  movingColor: HandSide;
  fromLocation: GridLocation;
  toLocation: GridLocation;
  direction: "clockwise" | "counterclockwise";
  leftLocation: GridLocation;
  rightLocation: GridLocation;
  leftOrientation: Orientation;
  rightOrientation: Orientation;
  leftPropType: PropType;
  rightPropType: PropType;
  betaSwapped: boolean;
  previewPictographData: StepData | PictographData | null;
}

export interface PlacementTransition {
  /** Static pictograph at the pre-move locations — the animation's start pose. */
  startData: PictographData;
  /** Step whose motions describe the move: pro-with-zero-turns for the moving
   *  prop, static hold for its partner. Drives the in-place interpolation. */
  transitionStep: StepData;
}

/** Reuses the animator's paths without changing the static notation being taught. */
export function buildPlacementTransformTransition(
  startData: PictographData,
  endData: PictographData,
  path: "arc" | "linear",
  direction: RotationDirection = RotationDirection.CLOCKWISE
): PlacementTransition {
  const motions = { ...endData.motions };
  for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
    const from = startData.motions?.[hand];
    const to = endData.motions?.[hand];
    if (!from || !to) continue;
    motions[hand] = createMotionData({
      ...to,
      startLocation: from.endLocation,
      startOrientation: from.endOrientation,
      motionType:
        from.endLocation === to.endLocation
          ? MotionType.STATIC
          : MotionType.PRO,
      rotationDirection: direction,
      turns: 0,
      pathShape: path,
    });
  }
  return {
    startData,
    transitionStep: {
      ...endData,
      motions,
      stepNumber: 0,
      duration: 1,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
    } as StepData,
  };
}

/**
 * Builds the pair of pictographs that let PictographContainer animate a start
 * position location change in place: the moving prop travels a pro-zero-turns
 * arc around the grid center while the partner's beta offset resolves via the
 * prepared-endpoint correction lerp in calculatePictographMotionPositions.
 */
export function buildPlacementTransition(
  input: PlacementTransitionInput
): PlacementTransition {
  const isBlueMoving = input.movingColor === HandSide.LEFT;

  const startData = buildPlacementPictographData({
    gridMode: input.gridMode,
    leftLocation: isBlueMoving ? input.fromLocation : input.leftLocation,
    rightLocation: isBlueMoving ? input.rightLocation : input.fromLocation,
    leftOrientation: input.leftOrientation,
    rightOrientation: input.rightOrientation,
    leftPropType: input.leftPropType,
    rightPropType: input.rightPropType,
    betaSwapped: input.betaSwapped,
    previewPictographData: input.previewPictographData,
  });

  const movingMotion = createMotionData({
    motionType: MotionType.PRO,
    rotationDirection:
      input.direction === "clockwise"
        ? RotationDirection.CLOCKWISE
        : RotationDirection.COUNTER_CLOCKWISE,
    startLocation: input.fromLocation,
    endLocation: input.toLocation,
    turns: 0,
    startOrientation: isBlueMoving
      ? input.leftOrientation
      : input.rightOrientation,
    endOrientation: isBlueMoving
      ? input.leftOrientation
      : input.rightOrientation,
    isVisible: true,
    propType: isBlueMoving ? input.leftPropType : input.rightPropType,
    arrowLocation: input.toLocation,
    hand: input.movingColor,
    gridMode: input.gridMode,
    // Force the circular path around the grid center regardless of the global
    // animation path-shape setting — this preview IS the pathway.
    pathShape: "arc",
  });
  const partnerMotion = buildMotion(
    isBlueMoving ? input.rightLocation : input.leftLocation,
    isBlueMoving ? HandSide.RIGHT : HandSide.LEFT,
    isBlueMoving ? input.rightOrientation : input.leftOrientation,
    isBlueMoving ? input.rightPropType : input.leftPropType,
    input.gridMode
  );

  const base = input.previewPictographData;
  const stepBase = base && "stepNumber" in base ? base : null;
  const transitionStep = {
    ...(base ?? {}),
    id: base?.id ?? "shared-prop-placement-grid",
    letter: base?.letter ?? null,
    startPosition: base?.startPosition ?? null,
    endPosition: base?.endPosition ?? null,
    gridMode: input.gridMode,
    betaSwapped: input.betaSwapped,
    motions: {
      [HandSide.LEFT]: isBlueMoving ? movingMotion : partnerMotion,
      [HandSide.RIGHT]: isBlueMoving ? partnerMotion : movingMotion,
    },
    // The container only computes motion overrides for StepData ("stepNumber"
    // narrowing), so guarantee the beat fields even without a preview step.
    stepNumber: stepBase?.stepNumber ?? 0,
    duration: stepBase?.duration ?? 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: stepBase?.isBlank ?? false,
  } as StepData;

  return { startData, transitionStep };
}

interface PlacementBetaOffsetInput {
  gridMode: GridMode;
  leftLocation: GridLocation | null;
  rightLocation: GridLocation | null;
  leftOrientation: Orientation;
  rightOrientation: Orientation;
  leftPropType: PropType;
  rightPropType: PropType;
  betaSwapped: boolean;
}

export interface PlacementBetaOffsets {
  left: { x: number; y: number };
  right: { x: number; y: number };
}

function betaMotionFor(
  hand: HandSide,
  location: GridLocation,
  orientation: Orientation,
  propType: PropType
): BetaMotionInput {
  return {
    startLocation: location,
    endLocation: location,
    endOrientation: orientation,
    motionType: MotionType.STATIC,
    hand,
    propType,
  };
}

export function calculatePlacementBetaOffsets(
  input: PlacementBetaOffsetInput
): PlacementBetaOffsets {
  if (
    input.leftLocation === null ||
    input.rightLocation === null ||
    input.leftLocation !== input.rightLocation
  ) {
    return { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  }

  const leftMotion = betaMotionFor(
    HandSide.LEFT,
    input.leftLocation,
    input.leftOrientation,
    input.leftPropType
  );
  const rightMotion = betaMotionFor(
    HandSide.RIGHT,
    input.rightLocation,
    input.rightOrientation,
    input.rightPropType
  );
  const betaInput = {
    leftMotion,
    rightMotion,
    letter: "",
    gridMode: input.gridMode as unknown as "diamond" | "box" | "skewed",
    leftPropType: input.leftPropType,
    rightPropType: input.rightPropType,
  };
  const sign = input.betaSwapped ? -1 : 1;
  const left = calculateBetaOffset(betaInput, leftMotion);
  const right = calculateBetaOffset(betaInput, rightMotion);

  return {
    left: { x: left.x * sign, y: left.y * sign },
    right: { x: right.x * sign, y: right.y * sign },
  };
}

export interface PlacementGuideCoordinates {
  left: PlacementGridPoint;
  right: PlacementGridPoint;
}

export function getPlacementGuideCoordinates(
  locations: {
    left: GridLocation;
    right: GridLocation;
  } | null
): PlacementGuideCoordinates | null {
  if (!locations) return null;

  const allGuidePoints = [
    ...getPlacementGridPoints(GridMode.DIAMOND),
    ...getPlacementGridPoints(GridMode.BOX),
  ];
  const left = allGuidePoints.find(
    (point) => point.location === locations.left
  );
  const right = allGuidePoints.find(
    (point) => point.location === locations.right
  );
  return left && right ? { left, right } : null;
}

export function computeGammaGuideArc(
  coordinates: PlacementGuideCoordinates | null
): string {
  if (!coordinates) return "";

  const centerX = 475;
  const centerY = 475;
  const radius = 60;
  const leftAngle = Math.atan2(
    coordinates.left.y - centerY,
    coordinates.left.x - centerX
  );
  const rightAngle = Math.atan2(
    coordinates.right.y - centerY,
    coordinates.right.x - centerX
  );
  const startX = centerX + radius * Math.cos(leftAngle);
  const startY = centerY + radius * Math.sin(leftAngle);
  const endX = centerX + radius * Math.cos(rightAngle);
  const endY = centerY + radius * Math.sin(rightAngle);
  let difference = rightAngle - leftAngle;

  if (difference < -Math.PI) difference += 2 * Math.PI;
  if (difference > Math.PI) difference -= 2 * Math.PI;

  return `M ${startX} ${startY} A ${radius} ${radius} 0 0 ${difference > 0 ? 1 : 0} ${endX} ${endY}`;
}
