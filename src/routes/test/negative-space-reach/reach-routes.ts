/**
 * The two routes through one wall-plane reach, as notation.
 *
 * `docs/reference/negative-space-and-wall-plane-reach.md` describes ONE motion
 * of ONE hand taken two ways: the right hand starts at the North point holding
 * the staff thumb-end-in and finishes at East thumb-end-out, and the performer
 * either sends the thumb end "through the pocket above my shoulder and behind
 * my forearm" (§4) or lets it "push downstage of the forearm" (§5). The
 * document is explicit that the two "take the same hand from the same start to
 * the same notated end point".
 *
 * Two prop paths satisfy that notation, and only two. The hand walks a 90°
 * arc; thumb-in to thumb-out is a 180° change in which end faces the centre; so
 * the staff either rotates 90° against the hand (anti, zero turns) or 90° with
 * it plus a half turn (pro, one turn). Those are Δ and Σ, and both are literal
 * rows of `static/data/pictographs/DiamondPictographDataframe.csv` sharing an
 * identical static left hand:
 *
 *   Δ,alpha1,gamma11,none,none,static,noRotation,s,s,anti,ccw,n,e
 *   Σ,alpha1,gamma11,none,none,static,noRotation,s,s,pro,cw,n,e
 *
 * Every other axis is held still, so prop rotation is the only variable
 * between the two panes.
 *
 * **This module does not claim which encoding is §4 and which is §5.** That is
 * open question 3 of the document ("Whether the two routes are a performer's
 * choice or determined by entry orientation, target, plane, or turn count"),
 * and the page answers it by measuring where the rig actually puts the thumb
 * end rather than by labelling a pane. What is asserted here is only that these
 * are the two prop paths the notation admits.
 *
 * End orientations are DERIVED through the production calculator rather than
 * typed in, so a fixture cannot quietly disagree with the orientation rules the
 * rest of the app runs on.
 */

import { withCalculatedArrowLocations } from "$lib/features/assemble-lab/services/builder-step-converter";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";

interface MotionSpec {
  readonly type: MotionType;
  /** PROP rotation direction, exactly as the dataframe row prints it. */
  readonly rot: RotationDirection;
  readonly from: GridLocation;
  readonly to: GridLocation;
  readonly startOri: Orientation;
  /** 1 turn is 180° of additional prop rotation. */
  readonly turns: number;
}

function makeMotion(spec: MotionSpec, hand: HandSide): MotionData {
  const provisional = createMotionData({
    motionType: spec.type,
    rotationDirection: spec.rot,
    startLocation: spec.from,
    endLocation: spec.to,
    startOrientation: spec.startOri,
    // Replaced below. The factory wants a value; the production calculator
    // supplies the real one, and typing one in here would be inventing domain
    // data the rest of the app derives.
    endOrientation: spec.startOri,
    turns: spec.turns,
    hand,
    gridMode: GridMode.DIAMOND,
    arrowLocation: spec.from,
  });
  return createMotionData({
    ...provisional,
    endOrientation: calculateEndOrientation(provisional, hand),
  });
}

function makeStep(
  stepNumber: number,
  letter: Letter,
  startPlacement: GridPlacement,
  endPlacement: GridPlacement,
  left: MotionSpec,
  right: MotionSpec
): StepData {
  return withCalculatedArrowLocations(
    createStepData({
      id: `reach-${letter}-${stepNumber}`,
      stepNumber,
      letter,
      startPlacement,
      endPlacement,
      gridMode: GridMode.DIAMOND,
      duration: 1,
      motions: {
        [HandSide.LEFT]: makeMotion(left, HandSide.LEFT),
        [HandSide.RIGHT]: makeMotion(right, HandSide.RIGHT),
      },
    })
  );
}

const { NORTH: N, EAST: E, SOUTH: S } = GridLocation;
const IN = Orientation.IN;
const OUT = Orientation.OUT;
const STATIC = MotionType.STATIC;
const NO_ROTATION = RotationDirection.NO_ROTATION;

/** Blue holds south throughout. It is the control, not part of the study. */
const BLUE_HELD_IN: MotionSpec = {
  type: STATIC,
  rot: NO_ROTATION,
  from: S,
  to: S,
  startOri: IN,
  turns: 0,
};

/** The right hand's own hold at the endpoint, so the final pose can be read. */
const RED_HELD_AT_EAST: MotionSpec = {
  type: STATIC,
  rot: NO_ROTATION,
  from: E,
  to: E,
  startOri: OUT,
  turns: 0,
};

/** Where the right hand starts: north, thumb end in. */
const RED_HELD_AT_NORTH: MotionSpec = {
  type: STATIC,
  rot: NO_ROTATION,
  from: N,
  to: N,
  startOri: IN,
  turns: 0,
};

export interface ReachRoute {
  readonly id: string;
  /** What the pane is called. Notation, not a claim about which § it is. */
  readonly label: string;
  /** The dataframe rows this is, spelled out. */
  readonly encoding: string;
  /**
   * How far the staff rotates across the reach, in degrees, signed the way the
   * dataframe signs its rotation direction. Presented so the two panes can be
   * told apart before either has been measured.
   */
  readonly propSweepDeg: number;
  readonly sequence: SequenceData;
}

function buildRoute(
  id: string,
  label: string,
  encoding: string,
  propSweepDeg: number,
  letter: Letter,
  right: MotionSpec
): ReachRoute {
  const reach = makeStep(
    1,
    letter,
    GridPlacement.ALPHA1,
    GridPlacement.GAMMA11,
    BLUE_HELD_IN,
    right
  );
  // γ,gamma11,gamma11,none,none,static,noRotation,s,s,static,noRotation,e,e —
  // a real hold row, so the endpoint the document describes from above can be
  // parked on and turned around rather than glimpsed at phase 0.99.
  const hold = makeStep(
    2,
    Letter.GAMMA,
    GridPlacement.GAMMA11,
    GridPlacement.GAMMA11,
    BLUE_HELD_IN,
    RED_HELD_AT_EAST
  );
  return {
    id,
    label,
    encoding,
    propSweepDeg,
    sequence: createSequenceData({
      id,
      name: label,
      word: `${letter}${Letter.GAMMA}`,
      steps: [reach, hold],
      gridMode: GridMode.DIAMOND,
      // The reach does not return to its start, so nothing here loops. Saying
      // otherwise would make the player carry a seam that does not exist.
      isCircular: false,
      startPlacement: createStartPlacementData({
        id: `${id}-start`,
        letter: null,
        startPlacement: GridPlacement.ALPHA1,
        endPlacement: GridPlacement.ALPHA1,
        gridPlacement: GridPlacement.ALPHA1,
        motions: {
          [HandSide.LEFT]: makeMotion(BLUE_HELD_IN, HandSide.LEFT),
          [HandSide.RIGHT]: makeMotion(RED_HELD_AT_NORTH, HandSide.RIGHT),
        },
      }),
    }),
  };
}

/**
 * Anti, counter-clockwise, zero turns: the staff rotates 90° AGAINST the hand
 * path, so the thumb end travels the short way round.
 */
export const SHORT_SWEEP_ROUTE: ReachRoute = buildRoute(
  "reach-anti-ccw-0",
  "Anti ccw · 0 turns",
  "Δ alpha1→gamma11 · red anti ccw n→e · blue static s",
  -90,
  Letter.DELTA,
  {
    type: MotionType.ANTI,
    rot: RotationDirection.COUNTER_CLOCKWISE,
    from: N,
    to: E,
    startOri: IN,
    turns: 0,
  }
);

/**
 * Pro, clockwise, one turn: the staff rotates 90° WITH the hand path plus a
 * further 180°, so the thumb end takes the long way round — up over the top,
 * which is the arc the document's pocket sits on.
 */
export const LONG_SWEEP_ROUTE: ReachRoute = buildRoute(
  "reach-pro-cw-1",
  "Pro cw · 1 turn",
  "Σ alpha1→gamma11 · red pro cw n→e, 1 turn · blue static s",
  270,
  Letter.SIGMA,
  {
    type: MotionType.PRO,
    rot: RotationDirection.CLOCKWISE,
    from: N,
    to: E,
    startOri: IN,
    turns: 1,
  }
);

/** Both panes, left to right. */
export const REACH_ROUTES: readonly ReachRoute[] = [
  SHORT_SWEEP_ROUTE,
  LONG_SWEEP_ROUTE,
];

/** Every route runs the same two steps, so one phase axis drives both panes. */
export const REACH_STEP_COUNT = SHORT_SWEEP_ROUTE.sequence.steps.length;

/** What the right hand is notated to do, for the page to state once. */
export const REACH_PREMISE = {
  hand: "Right hand (red prop)",
  from: "North, thumb end in",
  to: "East, thumb end out",
  startOrientation: SHORT_SWEEP_ROUTE.sequence.steps[0]!.motions.right
    .startOrientation as Orientation,
  endOrientation: SHORT_SWEEP_ROUTE.sequence.steps[0]!.motions.right
    .endOrientation as Orientation,
} as const;
