/**
 * Hand-authored Yuta CAP sequence for the /notation/caps live hero.
 *
 * The exact pattern Austen specced (2026-07-19), verified against the domain
 * server's orientation algebra (pro + even turns preserves orientation; anti +
 * odd turns preserves orientation), so every step is out → out:
 *
 *   1. pro  E → S, 0 turns, cw   (extension — pro at 0 turns, ori out: the
 *                                 club points away from center the whole way)
 *   2. pro  S → W, 0 turns, cw   (extension)
 *   3. anti W → S, 1 turn,  ccw  (antispin petal)
 *   4. anti S → E, 1 turn,  ccw  (antispin petal — closes the loop at east)
 *
 * One club, one hand: the blue hand is authored static-at-west with
 * isVisible:false, so engine and renderers skip it entirely.
 * Template lineage: buildGuideMotionSequence (guide-motion-configs.ts).
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

type PathShape = "arc" | "linear" | "concave";

interface Leg {
  start: GridLocation;
  end: GridLocation;
  type: MotionType;
  turns: number;
  rotation: RotationDirection;
  /* Per-motion pathShape WINS over the engine's motion-aware default
     (resolvePathType returns it first). Arc is canonical for CAP work —
     the hand rides the circle the whole way (Austen 2026-07-19). The
     antispin character comes from prop rotation vs hand travel, not from
     the hand path shape. */
  pathShape: PathShape;
}

const RED_LEGS: Leg[] = [
  {
    start: GridLocation.EAST,
    end: GridLocation.SOUTH,
    type: MotionType.PRO,
    turns: 0,
    rotation: RotationDirection.CLOCKWISE,
    pathShape: "arc",
  },
  {
    start: GridLocation.SOUTH,
    end: GridLocation.WEST,
    type: MotionType.PRO,
    turns: 0,
    rotation: RotationDirection.CLOCKWISE,
    pathShape: "arc",
  },
  /* rotationDirection is the PROP's rotation, not the hand's travel: the
     prop keeps spinning CW through the whole pattern. On the return half the
     hand travels ccw (w>s>e) against that cw prop rotation — which is
     exactly what makes these steps anti. Verified against a real app dump
     of this sequence (letters V V N Q): anti cw w>s t=1, anti cw s>e t=1. */
  {
    start: GridLocation.WEST,
    end: GridLocation.SOUTH,
    type: MotionType.ANTI,
    turns: 1,
    rotation: RotationDirection.CLOCKWISE,
    pathShape: "arc",
  },
  {
    start: GridLocation.SOUTH,
    end: GridLocation.EAST,
    type: MotionType.ANTI,
    turns: 1,
    rotation: RotationDirection.CLOCKWISE,
    pathShape: "arc",
  },
];

function makeMotion(
  hand: HandSide,
  start: GridLocation,
  end: GridLocation,
  type: MotionType,
  turns: number,
  rotation: RotationDirection,
  pathShape: PathShape,
  isVisible: boolean,
): MotionData {
  return {
    motionType: type,
    rotationDirection: rotation,
    startLocation: start,
    endLocation: end,
    hand,
    turns,
    startOrientation: Orientation.OUT,
    endOrientation: Orientation.OUT,
    isVisible,
    propType: PropType.CLUB,
    gridMode: GridMode.DIAMOND,
    pathShape,
    arrowLocation: start,
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

/* The hidden hand: engine and renderers skip isVisible:false motions
   entirely (isVisibleMotion guards), so this is a genuine solo club. */
function staticBlue(): MotionData {
  return makeMotion(
    HandSide.LEFT,
    GridLocation.WEST,
    GridLocation.WEST,
    MotionType.STATIC,
    0,
    RotationDirection.NO_ROTATION,
    "arc",
    false,
  );
}

export function buildYutaCapSequence(): SequenceData {
  const startPlacement: StartPlacementData = {
    isStartPlacement: true as const,
    id: "caps-yuta-start",
    gridMode: GridMode.DIAMOND,
    motions: {
      left: staticBlue(),
      right: makeMotion(
        HandSide.RIGHT,
        GridLocation.EAST,
        GridLocation.EAST,
        MotionType.STATIC,
        0,
        RotationDirection.NO_ROTATION,
        "arc",
        true,
      ),
    },
  };

  const steps: StepData[] = RED_LEGS.map((leg, i) => ({
    id: `caps-yuta-step${i + 1}`,
    stepNumber: i + 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    letter: null,
    startPlacement: null,
    endPlacement: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      left: staticBlue(),
      right: makeMotion(
        HandSide.RIGHT,
        leg.start,
        leg.end,
        leg.type,
        leg.turns,
        leg.rotation,
        leg.pathShape,
        true,
      ),
    },
  }));

  return createSequenceData({
    id: "caps-yuta-live",
    name: "Yuta CAP",
    word: "yuta-cap",
    steps,
    startPlacement,
    gridMode: GridMode.DIAMOND,
  });
}
