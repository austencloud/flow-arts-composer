/**
 * Builds one performer's hand-path sequence for the Hand Tunnel Lab.
 *
 * Starts from the canonical reference-card waypoints for the performer's TnD
 * and transforms them as pure grid-location math. Flip and mirror reverse each
 * hand's travel direction automatically because they remap the points the hand
 * moves between; nothing here reasons about clockwise or counterclockwise.
 *
 * Transform order is fixed: flip, mirror, rotate, phase. Presets are authored
 * against that order.
 */

import {
  HAND_PATH_REFERENCE_MOVES,
  type Move,
} from "$lib/features/choreo-card/domain/hand-path-reference-cards";
import { createStartPositionData } from "$lib/shared/foundation/domain/factories/create-start-position-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPositionFromLocations } from "$lib/shared/pictograph/grid/services/grid-position-deriver";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  LOOP_BEATS,
  type Performer,
  type Segment,
  type Tnd,
} from "../domain/hand-tunnel-types";

/** Five waypoints per hand: the start point plus one arrival per beat. The
 *  last point repeats the first because every TnD loop closes. */
export interface HandPathCycle {
  left: readonly GridLocation[];
  right: readonly GridLocation[];
}

export type CycleTransform = Pick<
  Segment,
  "flip" | "mirror" | "rotation" | "phase"
>;

const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;

const CLOCKWISE_RING: readonly GridLocation[] = [N, E, S, W];

const FLIP_MAP: Readonly<Partial<Record<GridLocation, GridLocation>>> = {
  [N]: S,
  [S]: N,
};

const MIRROR_MAP: Readonly<Partial<Record<GridLocation, GridLocation>>> = {
  [E]: W,
  [W]: E,
};

function cycleFromMoves(moves: readonly Move[]): HandPathCycle {
  const [start, ...beats] = moves;
  if (!start || beats.length !== LOOP_BEATS) {
    throw new Error(`Expected a start row plus ${LOOP_BEATS} beats`);
  }
  return {
    left: [start[0], ...beats.map((move) => move[1])],
    right: [start[2], ...beats.map((move) => move[3])],
  };
}

export function cycleForTnd(tnd: Tnd): HandPathCycle {
  return cycleFromMoves(HAND_PATH_REFERENCE_MOVES[tnd]);
}

function mapLocations(
  cycle: HandPathCycle,
  fn: (location: GridLocation) => GridLocation
): HandPathCycle {
  return { left: cycle.left.map(fn), right: cycle.right.map(fn) };
}

export function flipCycle(cycle: HandPathCycle): HandPathCycle {
  return mapLocations(cycle, (location) => FLIP_MAP[location] ?? location);
}

export function mirrorCycle(cycle: HandPathCycle): HandPathCycle {
  const reflected = mapLocations(
    cycle,
    (location) => MIRROR_MAP[location] ?? location
  );
  return { left: reflected.right, right: reflected.left };
}

export function rotateCycle(
  cycle: HandPathCycle,
  quarterTurns: number
): HandPathCycle {
  const turns = ((quarterTurns % 4) + 4) % 4;
  return mapLocations(cycle, (location) => {
    const index = CLOCKWISE_RING.indexOf(location);
    if (index === -1) return location;
    return CLOCKWISE_RING[(index + turns) % 4]!;
  });
}

export function phaseCycle(cycle: HandPathCycle, beats: number): HandPathCycle {
  const offset = ((beats % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS;
  const shift = (points: readonly GridLocation[]): GridLocation[] => {
    const open = points.slice(0, LOOP_BEATS);
    const rotated = [...open.slice(offset), ...open.slice(0, offset)];
    return [...rotated, rotated[0]!];
  };
  return { left: shift(cycle.left), right: shift(cycle.right) };
}

export function transformCycle(
  cycle: HandPathCycle,
  transform: CycleTransform
): HandPathCycle {
  let result = cycle;
  if (transform.flip) result = flipCycle(result);
  if (transform.mirror) result = mirrorCycle(result);
  result = rotateCycle(result, transform.rotation);
  result = phaseCycle(result, transform.phase);
  return result;
}

export function cycleForSegment(segment: Segment): HandPathCycle {
  return transformCycle(cycleForTnd(segment.tnd), segment);
}

function handMotion(hand: HandSide, from: GridLocation, to: GridLocation) {
  return createMotionData({
    hand,
    motionType: from === to ? MotionType.STATIC : MotionType.PRO,
    startLocation: from,
    endLocation: to,
    propType: PropType.HAND,
    gridMode: GridMode.DIAMOND,
  });
}

export function buildCycleSequence(
  id: string,
  name: string,
  cycle: HandPathCycle
): SequenceData {
  const startLeft = cycle.left[0]!;
  const startRight = cycle.right[0]!;
  const startPosition = getGridPositionFromLocations(startLeft, startRight);

  return createSequenceData({
    id,
    name,
    sequenceKind: "hand-path",
    metadata: { isHandPathVisualization: true },
    word: "",
    gridMode: GridMode.DIAMOND,
    isCircular: true,
    startPosition: createStartPositionData({
      id: `${id}-start`,
      startPosition,
      endPosition: startPosition,
      gridPosition: startPosition,
      motions: {
        left: handMotion(HandSide.LEFT, startLeft, startLeft),
        right: handMotion(HandSide.RIGHT, startRight, startRight),
      },
    }),
    steps: Array.from({ length: LOOP_BEATS }, (_, index) => {
      const leftFrom = cycle.left[index]!;
      const leftTo = cycle.left[index + 1]!;
      const rightFrom = cycle.right[index]!;
      const rightTo = cycle.right[index + 1]!;
      return createStepData({
        id: `${id}-${index + 1}`,
        letter: null,
        gridMode: GridMode.DIAMOND,
        startPosition: getGridPositionFromLocations(leftFrom, rightFrom),
        endPosition: getGridPositionFromLocations(leftTo, rightTo),
        stepNumber: index + 1,
        motions: {
          left: handMotion(HandSide.LEFT, leftFrom, leftTo),
          right: handMotion(HandSide.RIGHT, rightFrom, rightTo),
        },
      });
    }),
  });
}

/** The single-segment lab: the performer's first segment is the whole loop. */
export function buildPerformerSequence(performer: Performer): SequenceData {
  const segment = performer.segments[0];
  if (!segment) {
    throw new Error(`Performer ${performer.id} has no segments`);
  }
  return buildCycleSequence(
    `hand-tunnel-${performer.id}`,
    performer.label,
    cycleForSegment(segment)
  );
}

/** Ryan's shorthand for where the hands are: β at one point, α across from
 *  each other, γ a quarter apart. */
export function describeHands(left: GridLocation, right: GridLocation): string {
  const l = left.toUpperCase();
  const r = right.toUpperCase();
  if (left === right) return `β ${l}`;
  const li = CLOCKWISE_RING.indexOf(left);
  const ri = CLOCKWISE_RING.indexOf(right);
  const apart = li === -1 || ri === -1 ? 0 : (ri - li + 4) % 4;
  return apart === 2 ? `α ${l}·${r}` : `γ ${l}·${r}`;
}
