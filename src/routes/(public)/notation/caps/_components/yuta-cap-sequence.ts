/**
 * Hand-authored CAP sequences for /notation/caps: one club, one hand, an
 * extension piece joined to an antispin piece, reversing after a quarter, a
 * half or three quarters of the circle.
 *
 * Damien's notation for each piece ends in a division d, the share of the
 * circle used before the next piece starts. The half setting is the Yuta CAP
 * Austen specced (2026-07-19):
 *
 *   1. pro  E > S, 0 turns, cw   (extension: pro at 0 turns, ori out, so the
 *                                 club points away from center the whole way)
 *   2. pro  S > W, 0 turns, cw   (extension)
 *   3. anti W > S, 1 turn,  cw   (antispin petal)
 *   4. anti S > E, 1 turn,  cw   (antispin petal, closes the loop at east)
 *
 * The quarter and three-quarter settings use the same two pieces: `quarters`
 * pro legs clockwise round E, S, W, N, then the same points retraced back to
 * East as anti legs. Every step is out to out, checked against the domain
 * server's orientation algebra (pro + even turns keeps orientation; anti + odd
 * turns keeps orientation), so every setting closes and repeats.
 *
 * One club, one hand: the blue hand is authored static at west with
 * isVisible:false, so engine and renderers skip it entirely.
 * Template lineage: buildGuideMotionSequence (guide-motion-configs.ts).
 */
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  GridMode,
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

type PathShape = "arc" | "linear" | "concave";

/** How many quarters of the circle the hand travels before it reverses. */
export type CapQuarters = 1 | 2 | 3;

interface Leg {
  start: GridLocation;
  end: GridLocation;
  type: MotionType;
  turns: number;
  rotation: RotationDirection;
  /* Per-motion pathShape WINS over the engine's motion-aware default
     (resolvePathType returns it first). Arc is canonical for CAP work: the
     hand rides the circle the whole way (Austen 2026-07-19). The antispin
     character comes from prop rotation against hand travel, not from the
     hand path shape. */
  pathShape: PathShape;
}

const CIRCLE: readonly GridLocation[] = [
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
  GridLocation.NORTH,
];

/* rotationDirection is the PROP's rotation, not the hand's travel: the prop
   keeps spinning cw through the whole pattern. On the return half the hand
   travels ccw, back the way it came, against that cw prop rotation, which is
   exactly what makes those steps anti. Verified against a real app dump of
   the half setting (letters V V N Q): anti cw w>s t=1, anti cw s>e t=1. */
function capLegs(quarters: CapQuarters): Leg[] {
  const legs: Leg[] = [];
  for (let i = 0; i < quarters; i++) {
    legs.push({
      start: CIRCLE[i]!,
      end: CIRCLE[i + 1]!,
      type: MotionType.PRO,
      turns: 0,
      rotation: RotationDirection.CLOCKWISE,
      pathShape: "arc",
    });
  }
  for (let i = quarters; i > 0; i--) {
    legs.push({
      start: CIRCLE[i]!,
      end: CIRCLE[i - 1]!,
      type: MotionType.ANTI,
      turns: 1,
      rotation: RotationDirection.CLOCKWISE,
      pathShape: "arc",
    });
  }
  return legs;
}

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

/* The half setting keeps its original ids, so its poster and cached mandala
   art stay keyed as before. */
const KEYS: Record<CapQuarters, string> = {
  1: "quarter",
  2: "yuta",
  3: "three-quarter",
};

export function buildCapSequence(quarters: CapQuarters): SequenceData {
  const key = KEYS[quarters];
  const startPlacement: StartPlacementData = {
    isStartPlacement: true as const,
    id: `caps-${key}-start`,
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

  const steps: StepData[] = capLegs(quarters).map((leg, i) => ({
    id: `caps-${key}-step${i + 1}`,
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
    id: `caps-${key}-live`,
    name: quarters === 2 ? "Yuta CAP" : `CAP, ${key}`,
    word: `${key}-cap`,
    steps,
    startPlacement,
    gridMode: GridMode.DIAMOND,
  });
}

/** The half setting, the Yuta CAP. CapsAssembly draws its two halves. */
export function buildYutaCapSequence(): SequenceData {
  return buildCapSequence(2);
}
