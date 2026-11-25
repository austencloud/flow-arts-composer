import {
  buildFlowerAxis,
  type RotatingFlower,
  MODE_ORDER,
  type VtgMode,
  flowerToTrajectory,
  relateHands,
  startSoloHand,
  hasValidReversalPositions,
  isGravityBound,
  type QftTrajectory,
} from "@tka/shape-domain";
import { QFT_PRESETS } from "./qft-presets";
import type { QftHandCount, QftSessionHand } from "./qft-session";

export const QFT_FLOWERS: RotatingFlower[] = buildFlowerAxis().filter(
  (flower) => flower.grid === "diamond" && [0, 1, 2].includes(flower.turns)
);

const PRESET_BY_ID = new Map(QFT_PRESETS.map((move) => [move.id, move]));

function cloneTrajectory(trajectory: QftTrajectory): QftTrajectory {
  return {
    ...trajectory,
    propRate: [...trajectory.propRate] as QftTrajectory["propRate"],
  };
}

/** A swing needs a hand that moves; a hair is enough (Austen, 2026-11-22). */
export const MIN_SWING_RADIUS = 0.05;

export function minHandRadius(hand: QftSessionHand): number {
  return isGravityBound(resolveShape(hand)) ? MIN_SWING_RADIUS : 0;
}

export function resolveSessionHand(hand: QftSessionHand): QftTrajectory {
  const shape = resolveShape(hand);
  return isGravityBound(shape)
    ? { ...shape, radius: Math.max(MIN_SWING_RADIUS, shape.radius) }
    : shape;
}

function resolveShape(hand: QftSessionHand): QftTrajectory {
  const { source, radius } = hand;

  if (source.kind === "flower") {
    const flower = QFT_FLOWERS[source.index] ?? QFT_FLOWERS[0]!;
    return flowerToTrajectory(flower, radius);
  }

  if (source.kind === "preset") {
    const move = PRESET_BY_ID.get(source.id) ?? QFT_PRESETS[0]!;
    return { ...cloneTrajectory(move.trajectory), radius };
  }

  return { ...cloneTrajectory(source.trajectory), radius };
}

export interface ActiveQftHands {
  left: QftTrajectory;
  right?: QftTrajectory;
}

/**
 * The hands as chosen, or null when they cannot start that way: a pendulum's
 * hand never reaches the top, and two pendulums never meet in split time.
 * `startIndex` is where the left hand begins, on the body compass.
 */
export function buildActiveHands(
  handCount: QftHandCount,
  leftSelection: QftSessionHand,
  rightSelection: QftSessionHand,
  vtgMode: VtgMode,
  startIndex: number
): ActiveQftHands | null {
  const left = resolveSessionHand(leftSelection);

  if (handCount === "one") {
    const started = startSoloHand(left, startIndex);
    return started ? { left: started } : null;
  }

  return relateHands(
    left,
    resolveSessionHand(rightSelection),
    vtgMode,
    startIndex
  );
}

export function activeHandsAreValid(hands: ActiveQftHands | null): boolean {
  return (
    hands !== null &&
    hasValidReversalPositions(hands.left) &&
    (!hands.right || hasValidReversalPositions(hands.right))
  );
}

export function validOriginPhases(
  handCount: QftHandCount,
  left: QftSessionHand,
  right: QftSessionHand,
  vtgMode: VtgMode
): number[] {
  return Array.from({ length: 8 }, (_, phase) => phase).filter((phase) =>
    activeHandsAreValid(
      buildActiveHands(handCount, left, right, vtgMode, phase)
    )
  );
}

/** The modes these two moves can start in, from some starting position. */
export function validVtgModes(
  left: QftSessionHand,
  right: QftSessionHand
): VtgMode[] {
  return MODE_ORDER.filter(
    (mode) => validOriginPhases("two", left, right, mode).length > 0
  );
}

export function selectedPresetId(hand: QftSessionHand): string | null {
  return hand.source.kind === "preset" ? hand.source.id : null;
}

export function selectedFlowerIndex(hand: QftSessionHand): number | null {
  return hand.source.kind === "flower" ? hand.source.index : null;
}
