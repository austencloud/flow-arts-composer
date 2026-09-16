import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  GridLocation,
  GridPlacement,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { RawStepData, SequenceEntry } from "./types";

/**
 * Parse a raw motion type string to the MotionType enum.
 */
export function parseMotionType(value: string | undefined): MotionType {
  const str = String(value || "").toLowerCase();
  switch (str) {
    case "pro":
      return MotionType.PRO;
    case "anti":
      return MotionType.ANTI;
    case "float":
      return MotionType.FLOAT;
    case "dash":
      return MotionType.DASH;
    case "static":
      return MotionType.STATIC;
    default:
      return MotionType.STATIC;
  }
}

export function parseLocation(value: string | undefined): GridLocation {
  const str = String(value || "").toUpperCase();
  const locationMap: Record<string, GridLocation> = {
    N: GridLocation.NORTH,
    NORTH: GridLocation.NORTH,
    E: GridLocation.EAST,
    EAST: GridLocation.EAST,
    S: GridLocation.SOUTH,
    SOUTH: GridLocation.SOUTH,
    W: GridLocation.WEST,
    WEST: GridLocation.WEST,
    NE: GridLocation.NORTHEAST,
    NORTHEAST: GridLocation.NORTHEAST,
    SE: GridLocation.SOUTHEAST,
    SOUTHEAST: GridLocation.SOUTHEAST,
    SW: GridLocation.SOUTHWEST,
    SOUTHWEST: GridLocation.SOUTHWEST,
    NW: GridLocation.NORTHWEST,
    NORTHWEST: GridLocation.NORTHWEST,
  };
  return locationMap[str] ?? GridLocation.NORTH;
}

export function parseGridPlacement(value: string | undefined): GridPlacement | null {
  if (!value) return null;
  const str = String(value).toLowerCase();
  const enumKey = str.toUpperCase();
  const positionValue = GridPlacement[enumKey as keyof typeof GridPlacement];
  if (positionValue) return positionValue;
  for (const key in GridPlacement) {
    if (GridPlacement[key as keyof typeof GridPlacement] === str) {
      return str as GridPlacement;
    }
  }
  return null;
}

export function parseOrientation(value: string | undefined): Orientation {
  const str = String(value || "").toLowerCase();
  switch (str) {
    case "in":
      return Orientation.IN;
    case "out":
      return Orientation.OUT;
    case "clock":
    case "clockwise":
      return Orientation.CLOCK;
    case "counter":
    case "counterclockwise":
      return Orientation.COUNTER;
    default:
      return Orientation.IN;
  }
}

export function parseRotationDirection(value: string | undefined): RotationDirection {
  const str = String(value || "").toLowerCase();
  switch (str) {
    case "cw":
    case "clockwise":
      return RotationDirection.CLOCKWISE;
    case "ccw":
    case "counterclockwise":
    case "counter_clockwise":
      return RotationDirection.COUNTER_CLOCKWISE;
    case "no_rotation":
    case "norotation":
      return RotationDirection.NO_ROTATION;
    default:
      return RotationDirection.NO_ROTATION;
  }
}

export function parseTurns(value: string | number | undefined): number | "fl" {
  if (value === "fl" || value === "float") return "fl";
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

export function convertRawToBeats(
  sequenceName: string,
  rawSequence: RawStepData[],
  gridMode: GridMode
): {
  steps: StepData[];
  startPlacement:
    | (StartPlacementData & { stepNumber: number; isBlank: boolean })
    | null;
} {
  if (!rawSequence || rawSequence.length === 0) {
    return { steps: [], startPlacement: null };
  }

  // JSON structure:
  // - Element 0: Metadata (word, author, level, etc.) - no sequenceStartPlacement, no blue/red attributes
  // - Element 1: Start position with beat=0, sequenceStartPlacement, blue/red attributes
  // - Element 2+: Actual steps with beat>=1

  // Find the start position element (has sequenceStartPlacement AND beat === 0)
  const startPosElement = rawSequence.find(
    (el) => "sequenceStartPlacement" in el && el.beat === 0
  );

  // Parse start position if found
  // NOTE: We add stepNumber: 0 and isBlank: false so StepGrid/StepCell
  // properly recognize and render this as the start position with "Start" label
  // Using type assertion because StartPlacementData doesn't include these runtime fields
  let startPlacement:
    | (StartPlacementData & {
        stepNumber: number;
        isBlank: boolean;
      })
    | null = null;

  if (startPosElement) {
    const leftAttrs = startPosElement.leftAttributes;
    const rightAttrs = startPosElement.rightAttributes;
    const gridPlacement = parseGridPlacement(
      startPosElement.sequenceStartPlacement
    );

    startPlacement = {
      id: `start-${sequenceName}`,
      isStartPlacement: true as const,
      stepNumber: 0, // Required for StepCell to identify as start position
      isBlank: false, // Required for StepGrid to show start position
      letter: (startPosElement.letter as Letter | null) ?? null,
      gridPlacement,
      startPlacement: gridPlacement,
      endPlacement: null,
      motions: {
        [HandSide.LEFT]: leftAttrs
          ? createMotionData({
              hand: HandSide.LEFT,
              motionType: parseMotionType(leftAttrs.motionType),
              startLocation: parseLocation(leftAttrs.startLoc),
              endLocation: parseLocation(leftAttrs.endLoc),
              startOrientation: parseOrientation(leftAttrs.startOri),
              endOrientation: parseOrientation(leftAttrs.endOri),
              rotationDirection: parseRotationDirection(
                leftAttrs.propRotDir
              ),
              turns: parseTurns(leftAttrs.turns),
              isVisible: true,
              propType: PropType.STAFF,
              arrowLocation:
                parseLocation(leftAttrs.startLoc) || GridLocation.NORTH,
              gridMode,
            })
          : undefined,
        [HandSide.RIGHT]: rightAttrs
          ? createMotionData({
              hand: HandSide.RIGHT,
              motionType: parseMotionType(rightAttrs.motionType),
              startLocation: parseLocation(rightAttrs.startLoc),
              endLocation: parseLocation(rightAttrs.endLoc),
              startOrientation: parseOrientation(rightAttrs.startOri),
              endOrientation: parseOrientation(rightAttrs.endOri),
              rotationDirection: parseRotationDirection(
                rightAttrs.propRotDir
              ),
              turns: parseTurns(rightAttrs.turns),
              isVisible: true,
              propType: PropType.STAFF,
              arrowLocation:
                parseLocation(rightAttrs.startLoc) || GridLocation.SOUTH,
              gridMode,
            })
          : undefined,
      },
    };
  }

  // Filter to only actual steps: must have blue/red attributes AND beat >= 1
  // This excludes: metadata elements (no attributes) AND start position (beat === 0)
  const actualSteps = rawSequence.filter(
    (el) =>
      (el.leftAttributes || el.rightAttributes) &&
      el.beat !== undefined &&
      el.beat >= 1
  );

  const steps: StepData[] = actualSteps.map((step, index) => {
    const leftAttrs = step.leftAttributes;
    const rightAttrs = step.rightAttributes;

    return {
      id: `step-${sequenceName}-${index + 1}`,
      letter: (step.letter as Letter) ?? null,
      startPlacement:
        parseGridPlacement(step.startPos) ||
        parseGridPlacement(step.sequenceStartPlacement),
      endPlacement: parseGridPlacement(step.endPos),
      motions: {
        [HandSide.LEFT]: leftAttrs
          ? createMotionData({
              hand: HandSide.LEFT,
              motionType: parseMotionType(leftAttrs.motionType),
              startLocation: parseLocation(leftAttrs.startLoc),
              endLocation: parseLocation(leftAttrs.endLoc),
              startOrientation: parseOrientation(leftAttrs.startOri),
              endOrientation: parseOrientation(leftAttrs.endOri),
              rotationDirection: parseRotationDirection(
                leftAttrs.propRotDir
              ),
              turns: parseTurns(leftAttrs.turns),
              isVisible: true,
              propType: PropType.STAFF,
              arrowLocation:
                parseLocation(leftAttrs.startLoc) || GridLocation.NORTH,
              gridMode,
            })
          : undefined,
        [HandSide.RIGHT]: rightAttrs
          ? createMotionData({
              hand: HandSide.RIGHT,
              motionType: parseMotionType(rightAttrs.motionType),
              startLocation: parseLocation(rightAttrs.startLoc),
              endLocation: parseLocation(rightAttrs.endLoc),
              startOrientation: parseOrientation(rightAttrs.startOri),
              endOrientation: parseOrientation(rightAttrs.endOri),
              rotationDirection: parseRotationDirection(
                rightAttrs.propRotDir
              ),
              turns: parseTurns(rightAttrs.turns),
              isVisible: true,
              propType: PropType.STAFF,
              arrowLocation:
                parseLocation(rightAttrs.startLoc) || GridLocation.SOUTH,
              gridMode,
            })
          : undefined,
      },
      // Use step.beat directly (it's guaranteed >= 1 from filter)
      stepNumber: step.beat!,
      duration: 1.0,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
    } as StepData;
  });

  return { steps, startPlacement };
}

export function getAuthoritativeGridMode(seq: SequenceEntry): GridMode {
  const metadataGridMode = seq.fullMetadata?.sequence?.[0]?.gridMode;
  const rawGridMode = metadataGridMode ?? seq.gridMode;
  return rawGridMode === "box" ? GridMode.BOX : GridMode.DIAMOND;
}
