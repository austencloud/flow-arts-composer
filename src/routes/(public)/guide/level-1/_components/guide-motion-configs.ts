/**
 * Single source of truth for the Level 1 Guide hand-motion demos.
 *
 * GENERATED ASSETS: the mp4 loops under `static/guide/level-1/motions/{id}.mp4`
 * are baked from these configs, NOT hand-authored. To change a demo:
 *   1. Edit the relevant entry below.
 *   2. `npm run dev`, open `/test/guide-motion-bake`, click "Bake all".
 *   3. Eyeball the preview grid.
 *   4. Commit the changed `static/guide/level-1/motions/*.mp4`.
 *
 * `buildGuideMotionSequence` is the shared builder (extracted from the old
 * GuideMotionDemo.svelte). Only the bake route and the dev write endpoint
 * import this module - the runtime guide page imports nothing from here.
 */
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  GridMode,
  GridLocation,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

export interface GuideMotionLeg {
  start: GridLocation;
  end: GridLocation;
  motionType: MotionType;
}

export interface GuideMotionConfig {
  id: string;
  label: string;
  right: GuideMotionLeg;
  left?: GuideMotionLeg;
  /** Renderer visibility flag - threaded into `renderScene`'s `visibility.leftMotionVisible`
   *  by the bake helper. NOT reflected in the `SequenceData` output of `buildGuideMotionSequence`
   *  (the left motion is always present in the data; this flag controls whether it is drawn). */
  showLeft: boolean;
}

export const GUIDE_MOTION_CONFIGS: GuideMotionConfig[] = [
  // --- HandMotions.svelte (5) ---
  {
    id: "hm-start",
    label: "Hand resting static at west (starting position)",
    showLeft: false,
    right: {
      start: GridLocation.WEST,
      end: GridLocation.WEST,
      motionType: MotionType.STATIC,
    },
  },
  {
    id: "hm-shift-wn",
    label: "Hand shifts from west to north",
    showLeft: false,
    right: {
      start: GridLocation.WEST,
      end: GridLocation.NORTH,
      motionType: MotionType.PRO,
    },
  },
  {
    id: "hm-shift-ws",
    label: "Hand shifts from west to south",
    showLeft: false,
    right: {
      start: GridLocation.WEST,
      end: GridLocation.SOUTH,
      motionType: MotionType.PRO,
    },
  },
  {
    id: "hm-dash-we",
    label: "Hand dashes straight across from west to east",
    showLeft: false,
    right: {
      start: GridLocation.WEST,
      end: GridLocation.EAST,
      motionType: MotionType.DASH,
    },
  },
  {
    id: "hm-static-w", // Same motion as hm-start; separate baked asset for the static-branch cell in HandMotions.svelte (two distinct positions in the guide → two stable filenames).
    label: "Hand stays static at west",
    showLeft: false,
    right: {
      start: GridLocation.WEST,
      end: GridLocation.WEST,
      motionType: MotionType.STATIC,
    },
  },

  // --- Type1AlphaBeta.svelte (4) ---
  {
    id: "t1-split-same",
    label: "Dual-shift: both hands shift in parallel, alpha to alpha",
    showLeft: true,
    right: {
      start: GridLocation.EAST,
      end: GridLocation.NORTH,
      motionType: MotionType.PRO,
    },
    left: {
      start: GridLocation.WEST,
      end: GridLocation.SOUTH,
      motionType: MotionType.PRO,
    },
  },
  {
    // Genuine beta->beta (Together-Same). Both hands start together at east,
    // shift together to south. Canonical letter G (beta3->beta5), MCP-verified.
    // (Previously red S->E / blue S->W, which ends APART at alpha - wrong.)
    id: "t1-together-same",
    label:
      "Dual-shift: both hands shift together from east to south, beta to beta",
    showLeft: true,
    right: {
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      motionType: MotionType.PRO,
    },
    left: {
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      motionType: MotionType.PRO,
    },
  },
  {
    id: "t1-split-to-together",
    label: "Dual-shift: hands start apart and end together",
    showLeft: true,
    right: {
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      motionType: MotionType.PRO,
    },
    left: {
      start: GridLocation.WEST,
      end: GridLocation.SOUTH,
      motionType: MotionType.PRO,
    },
  },
  {
    id: "t1-together-to-split",
    label: "Dual-shift: hands start together and end apart",
    showLeft: true,
    right: {
      start: GridLocation.SOUTH,
      end: GridLocation.EAST,
      motionType: MotionType.PRO,
    },
    left: {
      start: GridLocation.SOUTH,
      end: GridLocation.WEST,
      motionType: MotionType.PRO,
    },
  },

  // --- Type1Gamma.svelte (2) ---
  {
    id: "t1-gamma-to-gamma",
    label: "Dual-shift from gamma to gamma",
    showLeft: true,
    right: {
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      motionType: MotionType.PRO,
    },
    left: {
      start: GridLocation.SOUTH,
      end: GridLocation.WEST,
      motionType: MotionType.PRO,
    },
  },
  {
    // Genuine gamma opposite-direction (Quarter-Opp): hands cross gamma halves.
    // Canonical letter M (gamma3->gamma13), MCP-verified: blue N->W, red E->S.
    // (Previously stayed within one gamma half = same-direction - wrong.)
    id: "t1-gamma-opposite",
    label: "Dual-shift at gamma, hands moving in opposite directions",
    showLeft: true,
    right: {
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      motionType: MotionType.PRO,
    },
    left: {
      start: GridLocation.NORTH,
      end: GridLocation.WEST,
      motionType: MotionType.PRO,
    },
  },

  // --- Type2Shifts.svelte (2) ---
  {
    id: "t2-red-shifts",
    label: "Shift: right hand shifts while left hand stays static",
    showLeft: true,
    right: {
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      motionType: MotionType.PRO,
    },
    left: {
      start: GridLocation.WEST,
      end: GridLocation.WEST,
      motionType: MotionType.STATIC,
    },
  },
  {
    id: "t2-blue-shifts",
    label: "Shift: left hand shifts while right hand stays static",
    showLeft: true,
    right: {
      start: GridLocation.EAST,
      end: GridLocation.EAST,
      motionType: MotionType.STATIC,
    },
    left: {
      start: GridLocation.WEST,
      end: GridLocation.NORTH,
      motionType: MotionType.PRO,
    },
  },

  // --- Type3CrossShifts.svelte (1) ---
  {
    id: "t3-cross-shift",
    label: "Cross-shift: right hand shifts while left hand dashes across",
    showLeft: true,
    right: {
      start: GridLocation.EAST,
      end: GridLocation.SOUTH,
      motionType: MotionType.PRO,
    },
    left: {
      start: GridLocation.WEST,
      end: GridLocation.EAST,
      motionType: MotionType.DASH,
    },
  },

  // --- Type4Dash.svelte (1) ---
  {
    id: "t4-dash",
    label: "Dash: right hand dashes across while left hand stays static",
    showLeft: true,
    right: {
      start: GridLocation.SOUTH,
      end: GridLocation.NORTH,
      motionType: MotionType.DASH,
    },
    left: {
      start: GridLocation.WEST,
      end: GridLocation.WEST,
      motionType: MotionType.STATIC,
    },
  },

  // --- Type5DualDash.svelte (1) ---
  {
    id: "t5-dual-dash",
    label: "Dual-dash: both hands dash across the center",
    showLeft: true,
    right: {
      start: GridLocation.EAST,
      end: GridLocation.WEST,
      motionType: MotionType.DASH,
    },
    left: {
      start: GridLocation.WEST,
      end: GridLocation.EAST,
      motionType: MotionType.DASH,
    },
  },

  // --- Type6Static.svelte (3) ---
  {
    id: "t6-static-alpha",
    label: "Static: both hands hold at alpha (opposite points)",
    showLeft: true,
    right: {
      start: GridLocation.EAST,
      end: GridLocation.EAST,
      motionType: MotionType.STATIC,
    },
    left: {
      start: GridLocation.WEST,
      end: GridLocation.WEST,
      motionType: MotionType.STATIC,
    },
  },
  {
    id: "t6-static-beta",
    label: "Static: both hands hold at beta (same point)",
    showLeft: true,
    right: {
      start: GridLocation.SOUTH,
      end: GridLocation.SOUTH,
      motionType: MotionType.STATIC,
    },
    left: {
      start: GridLocation.SOUTH,
      end: GridLocation.SOUTH,
      motionType: MotionType.STATIC,
    },
  },
  {
    id: "t6-static-gamma",
    label: "Static: both hands hold at gamma (right angle)",
    showLeft: true,
    right: {
      start: GridLocation.EAST,
      end: GridLocation.EAST,
      motionType: MotionType.STATIC,
    },
    left: {
      start: GridLocation.SOUTH,
      end: GridLocation.SOUTH,
      motionType: MotionType.STATIC,
    },
  },
];

export const GUIDE_MOTION_IDS: ReadonlySet<string> = new Set(
  GUIDE_MOTION_CONFIGS.map((c) => c.id)
);

export function isKnownMotionId(id: string): boolean {
  return GUIDE_MOTION_IDS.has(id);
}

function makeMotion(
  hand: HandSide,
  startLoc: GridLocation,
  endLoc: GridLocation,
  type: MotionType
): MotionData {
  // Guide demos hard-code a linear path archetype for every hand motion: the
  // Level 1 illustrations teach the grid points themselves, so a straight
  // point-to-point path reads cleaner than a curved shift arc. This per-motion
  // pathShape wins over the global path-shape setting in PropInterpolator's
  // resolvePathType, so the bake is deterministic regardless of user settings.
  const pathShape = "linear" as const;
  return {
    motionType: type,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: startLoc,
    endLocation: endLoc,
    hand,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    isVisible: true,
    propType: PropType.HAND,
    gridMode: GridMode.DIAMOND,
    pathShape,
    arrowLocation: startLoc,
    arrowPlacementData: {
      positionX: 0,
      positionY: 0,
      rotationAngle: 0,
      coordinates: null,
      svgCenter: null,
      svgMirrored: false,
      manualAdjustmentX: 0,
      manualAdjustmentY: 0,
    },
    propPlacementData: { positionX: 0, positionY: 0, rotationAngle: 0 },
  };
}

export function buildGuideMotionSequence(
  config: GuideMotionConfig
): SequenceData {
  const { right, left } = config;
  const leftStart = left?.start ?? right.start;
  const leftEnd = left?.end ?? leftStart;
  const leftMotionType = left?.motionType ?? MotionType.STATIC;

  const startPlacement: StartPlacementData = {
    isStartPlacement: true as const,
    id: `guide-${config.id}-start`,
    gridMode: GridMode.DIAMOND,
    motions: {
      left: makeMotion(HandSide.LEFT, leftStart, leftStart, MotionType.STATIC),
      right: makeMotion(
        HandSide.RIGHT,
        right.start,
        right.start,
        MotionType.STATIC
      ),
    },
  };

  const step: StepData = {
    id: `guide-${config.id}-step1`,
    stepNumber: 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter: null,
    startPlacement: null,
    endPlacement: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      left: makeMotion(HandSide.LEFT, leftStart, leftEnd, leftMotionType),
      right: makeMotion(
        HandSide.RIGHT,
        right.start,
        right.end,
        right.motionType
      ),
    },
  };

  return createSequenceData({
    id: `guide-motion-${config.id}`,
    name: config.id,
    word: config.id,
    steps: [step],
    startPlacement,
    gridMode: GridMode.DIAMOND,
  });
}

/**
 * Static-pictograph form of a motion demo, for print (and any non-animated
 * context). The motion's single step IS a pictograph: left + right MotionData with
 * start/end/type, where the arrow encodes direction and the hand the end point -
 * exactly how the original printed guide drew motions. Reuses `makeMotion` so the
 * geometry can never drift from the baked video.
 */
export function configToPictographData(
  config: GuideMotionConfig
): PictographData {
  const { right, left } = config;
  // Single-hand demos set showLeft: false - only the moving right hand is drawn,
  // matching the original printed guide. Omitting the left motion stops the
  // renderer from drawing a second hand.
  const rightMotion = makeMotion(
    HandSide.RIGHT,
    right.start,
    right.end,
    right.motionType
  );
  if (!config.showLeft) {
    return {
      id: `guide-pic-${config.id}`,
      gridMode: GridMode.DIAMOND,
      motions: { right: rightMotion },
    };
  }
  const leftStart = left?.start ?? right.start;
  const leftEnd = left?.end ?? leftStart;
  const leftMotionType = left?.motionType ?? MotionType.STATIC;
  return {
    id: `guide-pic-${config.id}`,
    gridMode: GridMode.DIAMOND,
    motions: {
      left: makeMotion(HandSide.LEFT, leftStart, leftEnd, leftMotionType),
      right: rightMotion,
    },
  };
}

const GUIDE_MOTION_BY_ID: ReadonlyMap<string, GuideMotionConfig> = new Map(
  GUIDE_MOTION_CONFIGS.map((c) => [c.id, c])
);

/** Pictograph data for a motion demo by id, or null if the id is unknown. */
export function getMotionPictographData(id: string): PictographData | null {
  const config = GUIDE_MOTION_BY_ID.get(id);
  return config ? configToPictographData(config) : null;
}
