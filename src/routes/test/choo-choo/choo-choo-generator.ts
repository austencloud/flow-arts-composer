/**
 * Choo Choo Generator
 *
 * Algorithmically generates Choo Choo sequences for validation.
 *
 * A Choo Choo is characterized by:
 * - One prop is STATIC with rotation (stays in place, spins)
 * - Other prop is FLOAT with no rotation (orbits around the static prop)
 * - Either the pinky or thumb ends of the props appear tethered together
 * - Full Choo Choo: 4 steps (complete orbit S→W→N→E→S)
 * - Half Choo Choo: 2 steps (half orbit S→W→N)
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { IMotionQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";

// Orbit path for floating prop (cardinal directions clockwise)
const CLOCKWISE_ORBIT: GridLocation[] = [
  GridLocation.SOUTH,
  GridLocation.WEST,
  GridLocation.NORTH,
  GridLocation.EAST,
];

// Counter-clockwise orbit
const COUNTER_CLOCKWISE_ORBIT: GridLocation[] = [
  GridLocation.SOUTH,
  GridLocation.EAST,
  GridLocation.NORTH,
  GridLocation.WEST,
];

// Orientation cycle for rotating prop (CW rotation)
const CW_ORIENTATION_CYCLE: Orientation[] = [
  Orientation.IN,
  Orientation.COUNTER,
  Orientation.OUT,
  Orientation.CLOCK,
];

// Orientation cycle for CCW rotation
const CCW_ORIENTATION_CYCLE: Orientation[] = [
  Orientation.IN,
  Orientation.CLOCK,
  Orientation.OUT,
  Orientation.COUNTER,
];

// Float orientation follows the orbit path
const CW_FLOAT_ORIENTATION_CYCLE: Orientation[] = [
  Orientation.IN, // S - pointing inward
  Orientation.CLOCK, // W - pointing clockwise
  Orientation.OUT, // N - pointing outward
  Orientation.COUNTER, // E - pointing counter
];

const CCW_FLOAT_ORIENTATION_CYCLE: Orientation[] = [
  Orientation.IN, // S - pointing inward
  Orientation.COUNTER, // E - pointing counter
  Orientation.OUT, // N - pointing outward
  Orientation.CLOCK, // W - pointing clockwise
];

export interface ChooChooConfig {
  /** Which prop is static (rotates in place) */
  staticProp: "left" | "right";
  /** Rotation direction of the static prop */
  rotationDirection: "cw" | "ccw";
  /** Orbit direction of the floating prop */
  orbitDirection: "cw" | "ccw";
  /** Number of steps (2 = half, 4 = full) */
  steps: 2 | 4;
  /** Starting location for the static prop */
  staticLocation: GridLocation;
  /** Starting location for the floating prop */
  floatStartLocation: GridLocation;
  /** Turns per beat for the static prop */
  turnsPerBeat: 0.5 | 1 | 1.5 | 2;
}

export const DEFAULT_CONFIG: ChooChooConfig = {
  staticProp: "left",
  rotationDirection: "cw",
  orbitDirection: "cw",
  steps: 4,
  staticLocation: GridLocation.SOUTH,
  floatStartLocation: GridLocation.SOUTH,
  turnsPerBeat: 0.5,
};

/**
 * Generate a Choo Choo sequence based on configuration
 * Uses the motion query handler for proper letter derivation
 */
export async function generateChooChoo(
  config: Partial<ChooChooConfig> = {},
  motionQueryHandler?: IMotionQueryHandler
): Promise<SequenceData> {
  const fullConfig: ChooChooConfig = { ...DEFAULT_CONFIG, ...config };

  const orbit =
    fullConfig.orbitDirection === "cw"
      ? CLOCKWISE_ORBIT
      : COUNTER_CLOCKWISE_ORBIT;
  const rotationCycle =
    fullConfig.rotationDirection === "cw"
      ? CW_ORIENTATION_CYCLE
      : CCW_ORIENTATION_CYCLE;
  const floatOrientationCycle =
    fullConfig.orbitDirection === "cw"
      ? CW_FLOAT_ORIENTATION_CYCLE
      : CCW_FLOAT_ORIENTATION_CYCLE;

  // Find starting index in orbit based on floatStartLocation
  const startIndex = orbit.indexOf(fullConfig.floatStartLocation);
  const actualStartIndex = startIndex >= 0 ? startIndex : 0;

  // Build start position
  const floatStartLoc = orbit[actualStartIndex] ?? GridLocation.SOUTH;
  const startPlacement = createStartPlacement(fullConfig, floatStartLoc);

  // Build steps with proper letter derivation
  const steps: StepData[] = [];
  for (let i = 0; i < fullConfig.steps; i++) {
    const beat = await createStep(
      fullConfig,
      i + 1,
      orbit,
      rotationCycle,
      floatOrientationCycle,
      actualStartIndex,
      i,
      motionQueryHandler
    );
    steps.push(beat);
  }

  // Generate sequence
  const sequenceId = crypto.randomUUID();
  const word = steps.map((b) => b.letter || "?").join("");

  return {
    id: sequenceId,
    name: `Choo Choo (${fullConfig.steps === 4 ? "Full" : "Half"}, ${fullConfig.staticProp} static, ${fullConfig.rotationDirection} rotation)`,
    word,
    steps,
    startPlacement,
    thumbnails: [],
    isFavorite: false,
    isCircular: fullConfig.steps === 4,
    tags: [
      "choo-choo",
      fullConfig.steps === 4 ? "full-choo-choo" : "half-choo-choo",
    ],
    metadata: { generatedBy: "ChooChooGenerator", config: fullConfig },
    gridMode: GridMode.DIAMOND,
    // propType removed - prop type is viewer preference, not sequence data
  };
}

function createStartPlacement(
  config: ChooChooConfig,
  floatLocation: GridLocation
): StartPlacementData {
  const staticMotion = createMotionData({
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: config.staticLocation,
    endLocation: config.staticLocation,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    hand: config.staticProp === "left" ? HandSide.LEFT : HandSide.RIGHT,
    gridMode: GridMode.DIAMOND,
    propType: PropType.STAFF,
    isVisible: true,
  });

  const floatMotion = createMotionData({
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: floatLocation,
    endLocation: floatLocation,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    hand: config.staticProp === "left" ? HandSide.RIGHT : HandSide.LEFT,
    gridMode: GridMode.DIAMOND,
    propType: PropType.STAFF,
    isVisible: true,
  });

  return {
    id: crypto.randomUUID(),
    isStartPlacement: true,
    letter: Letter.BETA,
    startPlacement: GridPlacement.BETA5,
    endPlacement: GridPlacement.BETA5,
    motions: {
      [HandSide.LEFT]:
        config.staticProp === "left" ? staticMotion : floatMotion,
      [HandSide.RIGHT]:
        config.staticProp === "right" ? staticMotion : floatMotion,
    },
  };
}

async function createStep(
  config: ChooChooConfig,
  stepNumber: number,
  orbit: GridLocation[],
  rotationCycle: Orientation[],
  floatOrientationCycle: Orientation[],
  orbitStartIndex: number,
  stepIndex: number,
  motionQueryHandler?: IMotionQueryHandler
): Promise<StepData> {
  // Calculate positions in the cycles
  const orbitIndex = (orbitStartIndex + stepIndex) % orbit.length;
  const nextOrbitIndex = (orbitStartIndex + stepIndex + 1) % orbit.length;

  const floatStart = orbit[orbitIndex] ?? GridLocation.SOUTH;
  const floatEnd = orbit[nextOrbitIndex] ?? GridLocation.WEST;

  // Calculate orientations
  const staticStartOri =
    rotationCycle[stepIndex % rotationCycle.length] ?? Orientation.IN;
  const staticEndOri =
    rotationCycle[(stepIndex + 1) % rotationCycle.length] ??
    Orientation.COUNTER;

  const floatStartOri = floatOrientationCycle[orbitIndex] ?? Orientation.IN;
  const floatEndOri =
    floatOrientationCycle[nextOrbitIndex] ?? Orientation.CLOCK;

  // Create static motion (rotates in place)
  const staticMotion = createMotionData({
    motionType: MotionType.STATIC,
    rotationDirection:
      config.rotationDirection === "cw"
        ? RotationDirection.CLOCKWISE
        : RotationDirection.COUNTER_CLOCKWISE,
    startLocation: config.staticLocation,
    endLocation: config.staticLocation,
    turns: config.turnsPerBeat,
    startOrientation: staticStartOri,
    endOrientation: staticEndOri,
    hand: config.staticProp === "left" ? HandSide.LEFT : HandSide.RIGHT,
    gridMode: GridMode.DIAMOND,
    propType: PropType.STAFF,
    isVisible: true,
  });

  // Create float motion (orbits around)
  const floatMotion = createMotionData({
    motionType: MotionType.FLOAT,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: floatStart,
    endLocation: floatEnd,
    turns: "fl" as unknown as number, // Float marker
    startOrientation: floatStartOri,
    endOrientation: floatEndOri,
    hand: config.staticProp === "left" ? HandSide.RIGHT : HandSide.LEFT,
    gridMode: GridMode.DIAMOND,
    propType: PropType.STAFF,
    isVisible: true,
    prefloatMotionType: MotionType.STATIC,
    prefloatRotationDirection: RotationDirection.NO_ROTATION,
  });

  // Assign motions based on config
  const leftMotion = config.staticProp === "left" ? staticMotion : floatMotion;
  const rightMotion = config.staticProp === "right" ? staticMotion : floatMotion;

  // Derive letter using the motion query handler (if available)
  let letter: Letter = Letter.THETA; // Fallback
  if (motionQueryHandler) {
    try {
      const derivedLetter =
        await motionQueryHandler.findLetterByMotionConfiguration(
          leftMotion,
          rightMotion,
          GridMode.DIAMOND
        );
      if (derivedLetter) {
        // Convert string to Letter enum
        letter = derivedLetter as Letter;
      } else {
        console.warn(
          `⚠️ No letter found for beat ${stepNumber}, using fallback`
        );
      }
    } catch (error) {
      console.warn(`⚠️ Error deriving letter for beat ${stepNumber}:`, error);
    }
  }

  // Calculate grid positions
  const startGridPos = getGridPlacement(floatStart, config.staticLocation);
  const endGridPos = getGridPlacement(floatEnd, config.staticLocation);

  return {
    id: crypto.randomUUID(),
    stepNumber,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter,
    startPlacement: startGridPos,
    endPlacement: endGridPos,
    motions: {
      [HandSide.LEFT]: leftMotion,
      [HandSide.RIGHT]: rightMotion,
    },
  };
}

/**
 * Get grid position based on float location and static location
 * This is a simplified mapping - real implementation would be more complex
 */
function getGridPlacement(
  floatLoc: GridLocation,
  staticLoc: GridLocation
): GridPlacement {
  // Simplified mapping for demonstration
  const positionMap: Record<string, GridPlacement> = {
    [`${GridLocation.SOUTH}_${GridLocation.SOUTH}`]: GridPlacement.BETA5,
    [`${GridLocation.WEST}_${GridLocation.SOUTH}`]: GridPlacement.GAMMA7,
    [`${GridLocation.NORTH}_${GridLocation.SOUTH}`]: GridPlacement.ALPHA1,
    [`${GridLocation.EAST}_${GridLocation.SOUTH}`]: GridPlacement.GAMMA11,
  };

  return positionMap[`${floatLoc}_${staticLoc}`] || GridPlacement.BETA5;
}

/**
 * Generate multiple Choo Choo variations for testing
 */
export async function generateChooChooVariations(
  motionQueryHandler?: IMotionQueryHandler
): Promise<SequenceData[]> {
  const variations: SequenceData[] = [];

  // Full Choo Choo - Blue static, CW rotation, CW orbit
  variations.push(
    await generateChooChoo(
      {
        staticProp: "left",
        rotationDirection: "cw",
        orbitDirection: "cw",
        steps: 4,
      },
      motionQueryHandler
    )
  );

  // Full Choo Choo - Red static, CW rotation, CW orbit
  variations.push(
    await generateChooChoo(
      {
        staticProp: "right",
        rotationDirection: "cw",
        orbitDirection: "cw",
        steps: 4,
      },
      motionQueryHandler
    )
  );

  // Full Choo Choo - Blue static, CCW rotation, CCW orbit
  variations.push(
    await generateChooChoo(
      {
        staticProp: "left",
        rotationDirection: "ccw",
        orbitDirection: "ccw",
        steps: 4,
      },
      motionQueryHandler
    )
  );

  // Half Choo Choo - Blue static, CW rotation, CW orbit
  variations.push(
    await generateChooChoo(
      {
        staticProp: "left",
        rotationDirection: "cw",
        orbitDirection: "cw",
        steps: 2,
      },
      motionQueryHandler
    )
  );

  // Half Choo Choo - Red static, CCW rotation, CW orbit
  variations.push(
    await generateChooChoo(
      {
        staticProp: "right",
        rotationDirection: "ccw",
        orbitDirection: "cw",
        steps: 2,
      },
      motionQueryHandler
    )
  );

  // Full Choo Choo with 1 turn per beat
  variations.push(
    await generateChooChoo(
      {
        staticProp: "left",
        rotationDirection: "cw",
        orbitDirection: "cw",
        steps: 4,
        turnsPerBeat: 1,
      },
      motionQueryHandler
    )
  );

  return variations;
}

/**
 * Detect if a sequence contains a Choo Choo pattern
 */
export function detectChooChoo(sequence: SequenceData): {
  hasChooChoo: boolean;
  type: "full" | "half" | "none";
  startStep?: number;
  endStep?: number;
  staticProp?: "left" | "right";
} {
  if (!sequence.steps || sequence.steps.length < 2) {
    return { hasChooChoo: false, type: "none" };
  }

  // Look for consecutive steps that match Choo Choo pattern
  for (let i = 0; i <= sequence.steps.length - 2; i++) {
    const result = checkChooChooStartingAt(sequence.steps as StepData[], i);
    if (result.hasChooChoo) {
      return result;
    }
  }

  return { hasChooChoo: false, type: "none" };
}

function checkChooChooStartingAt(
  steps: StepData[],
  startIndex: number
): {
  hasChooChoo: boolean;
  type: "full" | "half" | "none";
  startStep?: number;
  endStep?: number;
  staticProp?: "left" | "right";
} {
  // Need at least 2 steps for a half Choo Choo
  if (startIndex + 2 > steps.length) {
    return { hasChooChoo: false, type: "none" };
  }

  const firstStep = steps[startIndex];
  if (!firstStep) {
    return { hasChooChoo: false, type: "none" };
  }
  const leftMotion = firstStep.motions?.[HandSide.LEFT];
  const rightMotion = firstStep.motions?.[HandSide.RIGHT];

  if (!leftMotion || !rightMotion) {
    return { hasChooChoo: false, type: "none" };
  }

  // Determine which prop is static (with rotation) and which is float
  let staticProp: "left" | "right" | null = null;

  if (
    leftMotion.motionType === MotionType.STATIC &&
    typeof leftMotion.turns === "number" &&
    leftMotion.turns > 0 &&
    rightMotion.motionType === MotionType.FLOAT
  ) {
    staticProp = "left";
  } else if (
    rightMotion.motionType === MotionType.STATIC &&
    typeof rightMotion.turns === "number" &&
    rightMotion.turns > 0 &&
    leftMotion.motionType === MotionType.FLOAT
  ) {
    staticProp = "right";
  }

  if (!staticProp) {
    return { hasChooChoo: false, type: "none" };
  }

  // Check subsequent steps maintain the pattern
  let consecutiveBeats = 1;
  const floatLocations: GridLocation[] = [
    staticProp === "left" ? rightMotion.startLocation : leftMotion.startLocation,
  ];

  for (let i = startIndex + 1; i < steps.length && i < startIndex + 4; i++) {
    const beat = steps[i];
    if (!beat) break;

    const bMotion = beat.motions?.[HandSide.LEFT];
    const rMotion = beat.motions?.[HandSide.RIGHT];

    if (!bMotion || !rMotion) break;

    const staticM = staticProp === "left" ? bMotion : rMotion;
    const floatM = staticProp === "left" ? rMotion : bMotion;

    // Verify static prop stays static with rotation
    if (
      staticM.motionType !== MotionType.STATIC ||
      typeof staticM.turns !== "number" ||
      staticM.turns <= 0
    ) {
      break;
    }

    // Verify float prop remains float
    if (floatM.motionType !== MotionType.FLOAT) {
      break;
    }

    consecutiveBeats++;
    floatLocations.push(floatM.startLocation);
  }

  // Check if float locations form a valid orbit path
  if (consecutiveBeats >= 4 && isValidOrbitPath(floatLocations)) {
    return {
      hasChooChoo: true,
      type: "full",
      startStep: startIndex + 1,
      endStep: startIndex + 4,
      staticProp,
    };
  } else if (consecutiveBeats >= 2) {
    return {
      hasChooChoo: true,
      type: "half",
      startStep: startIndex + 1,
      endStep: startIndex + consecutiveBeats,
      staticProp,
    };
  }

  return { hasChooChoo: false, type: "none" };
}

function isValidOrbitPath(locations: GridLocation[]): boolean {
  if (locations.length < 4) return false;

  // Check if locations follow clockwise or counter-clockwise pattern
  const cwValid = locations
    .slice(0, 4)
    .every((loc, i) => loc === CLOCKWISE_ORBIT[i]);
  const ccwValid = locations
    .slice(0, 4)
    .every((loc, i) => loc === COUNTER_CLOCKWISE_ORBIT[i]);

  return cwValid || ccwValid;
}
