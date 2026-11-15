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
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  calculateBetaOffset,
  type BetaMotionInput,
} from "#lib/shared/render/core/calculations/beta-offset.js";

export interface PlacementPromptSegment {
  kind: "text" | "noun" | "aim";
  text: string;
}

export interface PlacementPromptParts {
  /** The sentence in reading order, so each language places the noun itself. */
  segments: PlacementPromptSegment[];
  color: HandSide;
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

const AIM_LABEL_KEYS: Partial<Record<Orientation, TranslationKey>> = {
  [Orientation.IN]: "create_ui_orientation_in_label",
  [Orientation.OUT]: "create_ui_orientation_out_label",
  [Orientation.CLOCK]: "create_ui_orientation_clock_label",
  [Orientation.COUNTER]: "create_ui_orientation_counter_label",
  [Orientation.CENTER_N]: "create_ui_orientation_centerN_label",
  [Orientation.CENTER_NE]: "create_ui_orientation_centerNE_label",
  [Orientation.CENTER_E]: "create_ui_orientation_centerE_label",
  [Orientation.CENTER_SE]: "create_ui_orientation_centerSE_label",
  [Orientation.CENTER_S]: "create_ui_orientation_centerS_label",
  [Orientation.CENTER_SW]: "create_ui_orientation_centerSW_label",
  [Orientation.CENTER_W]: "create_ui_orientation_centerW_label",
  [Orientation.CENTER_NW]: "create_ui_orientation_centerNW_label",
};

// Stand-ins for the noun and aim while the whole sentence is translated, so
// the sentence can be cut back into pieces in the order the language uses.
const NOUN_MARK = "\u0001";
const AIM_MARK = "\u0002";

function splitSentence(
  key: TranslationKey,
  noun: string,
  aim: string | null
): PlacementPromptSegment[] {
  const sentence = t(key, { noun: NOUN_MARK, aim: AIM_MARK });
  return sentence
    .split(/([\u0001\u0002])/)
    .filter((piece) => piece !== "")
    .map((piece) =>
      piece === NOUN_MARK
        ? { kind: "noun" as const, text: noun }
        : piece === AIM_MARK
          ? { kind: "aim" as const, text: aim ?? "" }
          : { kind: "text" as const, text: piece }
    );
}

export function buildPlacementPrompt(input: PlacementPromptInput): {
  parts: PlacementPromptParts | null;
  text: string;
} {
  const build = (
    noun: string,
    color: HandSide,
    key: TranslationKey,
    aim: string | null = null
  ): PlacementPromptParts => ({ segments: splitSentence(key, noun, aim), color });

  let parts: PlacementPromptParts | null = null;

  if (!input.disabled) {
    if (input.dragHand !== null && input.dragAim !== null) {
      const noun =
        input.dragHand === HandSide.LEFT ? input.leftNoun : input.rightNoun;
      const aimKey = AIM_LABEL_KEYS[input.dragAim];
      const aim = aimKey ? t(aimKey) : null;
      parts = build(
        noun,
        input.dragHand,
        aim ? "pictograph_placement_aiming_at" : "pictograph_placement_aiming",
        aim
      );
    } else if (input.activeHand === null && input.hoverHand !== null) {
      const noun =
        input.hoverHand === HandSide.LEFT ? input.leftNoun : input.rightNoun;
      parts = build(noun, input.hoverHand, "pictograph_placement_drag_to_aim");
    } else if (input.activeHand !== null) {
      const left = input.activeHand === HandSide.LEFT;
      const location = left ? input.leftLocation : input.rightLocation;
      parts = build(
        left ? input.leftNoun : input.rightNoun,
        input.activeHand,
        location !== null
          ? "pictograph_placement_choose_new_location"
          : input.canAim
            ? "pictograph_placement_press_and_drag"
            : "pictograph_placement_place"
      );
    }
  }

  const text = parts
    ? parts.segments.map((segment) => segment.text).join("")
    : !input.disabled && input.isComplete
      ? input.canAim
        ? t("pictograph_placement_drag_a_prop")
        : t("pictograph_placement_ready")
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
    startPlacement: input.previewPictographData?.startPlacement ?? null,
    endPlacement: input.previewPictographData?.endPlacement ?? null,
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
  /** "arc" (default) is the pro shift around the center; "dash" goes straight through it. */
  path?: "arc" | "dash";
  /** The partner's own move when both hands travel together. Without it the
   *  partner holds its committed point. */
  partnerMove?: PlacementPartnerMove | null;
  /** Null when the grid holds only the moving hand. */
  leftLocation: GridLocation | null;
  rightLocation: GridLocation | null;
  leftOrientation: Orientation;
  rightOrientation: Orientation;
  leftPropType: PropType;
  rightPropType: PropType;
  betaSwapped: boolean;
  previewPictographData: StepData | PictographData | null;
}

export interface PlacementPartnerMove {
  fromLocation: GridLocation;
  toLocation: GridLocation;
  direction: "clockwise" | "counterclockwise";
  path?: "arc" | "dash";
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
 * placement location change in place: the moving prop travels a pro-zero-turns
 * arc around the grid center (or a straight dash through it) while the
 * partner, when there is one, resolves its beta offset via the
 * prepared-endpoint correction lerp in calculatePictographMotionPositions.
 */
export function buildPlacementTransition(
  input: PlacementTransitionInput
): PlacementTransition {
  const isBlueMoving = input.movingColor === HandSide.LEFT;
  const partnerMove = input.partnerMove ?? null;
  const partnerStart = (committed: GridLocation | null) =>
    partnerMove ? partnerMove.fromLocation : committed;

  const startData = buildPlacementPictographData({
    gridMode: input.gridMode,
    leftLocation: isBlueMoving
      ? input.fromLocation
      : partnerStart(input.leftLocation),
    rightLocation: isBlueMoving
      ? partnerStart(input.rightLocation)
      : input.fromLocation,
    leftOrientation: input.leftOrientation,
    rightOrientation: input.rightOrientation,
    leftPropType: input.leftPropType,
    rightPropType: input.rightPropType,
    betaSwapped: input.betaSwapped,
    previewPictographData: input.previewPictographData,
  });

  const travelMotion = (color: HandSide, move: PlacementPartnerMove) => {
    const dash = move.path === "dash";
    const isBlue = color === HandSide.LEFT;
    const orientation = isBlue ? input.leftOrientation : input.rightOrientation;
    return createMotionData({
      motionType: dash ? MotionType.DASH : MotionType.PRO,
      rotationDirection: dash
        ? RotationDirection.NO_ROTATION
        : move.direction === "clockwise"
          ? RotationDirection.CLOCKWISE
          : RotationDirection.COUNTER_CLOCKWISE,
      startLocation: move.fromLocation,
      endLocation: move.toLocation,
      turns: 0,
      startOrientation: orientation,
      endOrientation: orientation,
      isVisible: true,
      propType: isBlue ? input.leftPropType : input.rightPropType,
      arrowLocation: move.toLocation,
      hand: color,
      gridMode: input.gridMode,
      // Force the circular path around the grid center regardless of the
      // global animation path-shape setting — this preview IS the pathway. A
      // dash is always straight, so it needs no override.
      ...(dash ? {} : { pathShape: "arc" as const }),
    });
  };
  const movingMotion = travelMotion(input.movingColor, {
    fromLocation: input.fromLocation,
    toLocation: input.toLocation,
    direction: input.direction,
    path: input.path,
  });
  const partnerColor = isBlueMoving ? HandSide.RIGHT : HandSide.LEFT;
  const partnerLocation = isBlueMoving
    ? input.rightLocation
    : input.leftLocation;
  const partnerMotion = partnerMove
    ? travelMotion(partnerColor, partnerMove)
    : partnerLocation
      ? buildMotion(
          partnerLocation,
          partnerColor,
          isBlueMoving ? input.rightOrientation : input.leftOrientation,
          isBlueMoving ? input.rightPropType : input.leftPropType,
          input.gridMode
        )
      : null;
  const motions: PictographData["motions"] = {
    [input.movingColor]: movingMotion,
  };
  if (partnerMotion) motions[partnerColor] = partnerMotion;

  const base = input.previewPictographData;
  const stepBase = base && "stepNumber" in base ? base : null;
  const transitionStep = {
    ...(base ?? {}),
    id: base?.id ?? "shared-prop-placement-grid",
    letter: base?.letter ?? null,
    startPlacement: base?.startPlacement ?? null,
    endPlacement: base?.endPlacement ?? null,
    gridMode: input.gridMode,
    betaSwapped: input.betaSwapped,
    motions,
    // The container only computes motion overrides for StepData ("stepNumber"
    // narrowing), so guarantee the beat fields even without a preview step.
    // Without one, -1 (no label): 0 would draw "Start" and the hand key on
    // every frame of the move, which the resting grid never shows.
    stepNumber: stepBase?.stepNumber ?? -1,
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
