import { Plane } from "@tka/tka-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SoloPropData } from "$lib/shared/foundation/domain/models/solo-prop-data";
import type { SoloPropStepData } from "$lib/shared/foundation/domain/models/solo-prop-step-data";
import { createSoloProp } from "$lib/shared/foundation/services/solo-prop-factory";
import { fuseSequences } from "$lib/features/fuse/services/sequence-fuser";
import {
  GridLocation,
  GridMode,
  type GridLocation as GridLocationValue,
  type GridMode as GridModeValue,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandPath,
  MotionType,
  Orientation,
  RotationDirection,
  SkewDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

export interface FuseProofCheck {
  readonly label: string;
  readonly expected: string;
  readonly actual: string;
  readonly passes: boolean;
}

export interface FuseMotionProofCase {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly sequence: SequenceData;
  readonly expectedGridMode: GridModeValue;
  readonly checks: readonly FuseProofCheck[];
  readonly stepIndex: number;
}

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;
const {
  NORTHEAST: NE,
  SOUTHEAST: SE,
  SOUTHWEST: SW,
  NORTHWEST: NW,
} = GridLocation;

const DIAMOND_RING = [N, E, S, W, N, E, S, W] as const;
const BOX_RING = [NE, SE, SW, NW, NE, SE, SW, NW] as const;
const SKEWED_RING = [N, NE, E, SE, S, SW, W, NW] as const;
const CENTRIC_RING = [
  N,
  GridLocation.CENTER,
  E,
  GridLocation.CENTER,
  S,
  GridLocation.CENTER,
  W,
  GridLocation.CENTER,
] as const;

function ringSolo(
  ring: readonly GridLocationValue[],
  offset = 0
): SoloPropData {
  const steps: SoloPropStepData[] = ring.map((_, index) => {
    const startLocation = ring[(index + offset) % ring.length]!;
    const endLocation = ring[(index + offset + 1) % ring.length]!;
    return {
      startLocation,
      endLocation,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      turns: 0,
      duration: 1,
    };
  });

  return createSoloProp(steps, steps[0]!.startLocation, Orientation.IN);
}

function floatingLeftSolo(): SoloPropData {
  const ring: readonly [GridLocationValue, GridLocationValue][] = [
    [W, N],
    [N, E],
    [E, S],
    [S, W],
  ];
  const steps: SoloPropStepData[] = ring.map(
    ([startLocation, endLocation]) => ({
      startLocation,
      endLocation,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      motionType: MotionType.FLOAT,
      rotationDirection: RotationDirection.NO_ROTATION,
      turns: "fl",
      prefloatMotionType: MotionType.ANTI,
      handPath: HandPath.CLOCKWISE,
      skewSteps: 0,
      skewDir: SkewDirection.PLUS,
      plane: Plane.wheel,
      duration: 1,
    })
  );
  return createSoloProp(steps, W, Orientation.IN);
}

function proRightSolo(): SoloPropData {
  const ring: readonly [GridLocationValue, GridLocationValue][] = [
    [E, S],
    [S, W],
    [W, N],
    [N, E],
  ];
  const steps: SoloPropStepData[] = ring.map(
    ([startLocation, endLocation]) => ({
      startLocation,
      endLocation,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      motionType: MotionType.PRO,
      rotationDirection: RotationDirection.CLOCKWISE,
      turns: 0,
      handPath: HandPath.CLOCKWISE,
      skewSteps: 0,
      skewDir: SkewDirection.PLUS,
      plane: Plane.floor,
      duration: 1,
    })
  );
  return createSoloProp(steps, E, Orientation.IN);
}

function check(
  label: string,
  expected: unknown,
  actual: unknown
): FuseProofCheck {
  return {
    label,
    expected: String(expected),
    actual: String(actual),
    passes: Object.is(expected, actual),
  };
}

function gridCase(
  id: string,
  title: string,
  detail: string,
  left: SoloPropData,
  right: SoloPropData,
  expectedGridMode: GridModeValue
): FuseMotionProofCase {
  const sequence = fuseSequences(left, right);
  return {
    id,
    title,
    detail,
    sequence,
    expectedGridMode,
    stepIndex: 0,
    checks: [
      check("fused grid", expectedGridMode, sequence.gridMode),
      check(
        "blue native grid",
        left.impliedGridMode,
        sequence.steps[0]?.motions.left?.gridMode
      ),
      check(
        "red native grid",
        right.impliedGridMode,
        sequence.steps[0]?.motions.right?.gridMode
      ),
    ],
  };
}

export function buildFuseMotionProofCases(): readonly FuseMotionProofCase[] {
  const floatSequence = fuseSequences(floatingLeftSolo(), proRightSolo());
  const floatLeft = floatSequence.steps[0]!.motions.left!;
  const floatRight = floatSequence.steps[0]!.motions.right!;

  return [
    {
      id: "float-fidelity",
      title: "Float provenance",
      detail:
        "The authored anti float starts west, so the blue float arrow must seed west while its collapsed rotation remains counter-clockwise.",
      sequence: floatSequence,
      expectedGridMode: GridMode.DIAMOND,
      stepIndex: 0,
      checks: [
        check("fused grid", GridMode.DIAMOND, floatSequence.gridMode),
        check("blue arrow seed", W, floatLeft.arrowLocation),
        check("blue prefloat", MotionType.ANTI, floatLeft.prefloatMotionType),
        check(
          "blue prefloat rotation",
          RotationDirection.COUNTER_CLOCKWISE,
          floatLeft.prefloatRotationDirection
        ),
        check("blue hand path", HandPath.CLOCKWISE, floatLeft.handPath),
        check("blue skew steps", 0, floatLeft.skewSteps),
        check("blue skew direction", SkewDirection.PLUS, floatLeft.skewDir),
        check("blue plane", Plane.wheel, floatLeft.plane),
        check("red arrow seed", E, floatRight.arrowLocation),
        check("red plane", Plane.floor, floatRight.plane),
      ],
    },
    gridCase(
      "diamond",
      "Diamond + diamond",
      "Both hands retain the cardinal diamond frame.",
      ringSolo(DIAMOND_RING),
      ringSolo(DIAMOND_RING, 2),
      GridMode.DIAMOND
    ),
    gridCase(
      "box",
      "Box + box",
      "Both hands retain the intercardinal box frame.",
      ringSolo(BOX_RING),
      ringSolo(BOX_RING, 2),
      GridMode.BOX
    ),
    gridCase(
      "mixed",
      "Diamond + box",
      "Different square frames resolve to one skewed fused frame.",
      ringSolo(DIAMOND_RING),
      ringSolo(BOX_RING),
      GridMode.SKEWED
    ),
    gridCase(
      "skew-right",
      "Diamond + skewed",
      "A skewed source on the red side still makes the fused frame skewed.",
      ringSolo(DIAMOND_RING),
      ringSolo(SKEWED_RING),
      GridMode.SKEWED
    ),
    gridCase(
      "skew-left",
      "Skewed + diamond",
      "Swapping source sides produces the same fused frame.",
      ringSolo(SKEWED_RING),
      ringSolo(DIAMOND_RING),
      GridMode.SKEWED
    ),
    gridCase(
      "centric",
      "Diamond + center",
      "A center-touching source selects the centric frame.",
      ringSolo(DIAMOND_RING),
      ringSolo(CENTRIC_RING),
      GridMode.CENTRIC
    ),
  ];
}
