import {
  buildFlowerAxis,
  type RotatingFlower,
} from "#lib/shared/shape-matrix/domain/flower-signature.js";
import {
  MODE_ORDER,
  type VtgMode,
} from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
import { flowerToTrajectory, relateTrajectories } from "./qft-flower-bridge";
import { GUIDE_MOVES } from "./qft-guide";
import type { QftHandCount, QftSessionHand } from "./qft-session";
import {
  hasValidReversalPositions,
  withTrajectoryPhase,
  type QftTrajectory,
} from "./qft-trajectory";

export const QFT_FLOWERS: RotatingFlower[] = buildFlowerAxis().filter(
  (flower) => flower.grid === "diamond" && [0, 1, 2].includes(flower.turns)
);

const PRESET_BY_ID = new Map(GUIDE_MOVES.map((move) => [move.id, move]));

function cloneTrajectory(trajectory: QftTrajectory): QftTrajectory {
  return {
    ...trajectory,
    propRate: [...trajectory.propRate] as QftTrajectory["propRate"],
  };
}

export function resolveSessionHand(hand: QftSessionHand): QftTrajectory {
  const { source, radius } = hand;

  if (source.kind === "flower") {
    const flower = QFT_FLOWERS[source.index] ?? QFT_FLOWERS[0]!;
    return flowerToTrajectory(flower, radius);
  }

  if (source.kind === "preset") {
    const move = PRESET_BY_ID.get(source.id) ?? GUIDE_MOVES[0]!;
    return { ...cloneTrajectory(move.trajectory), radius };
  }

  return { ...cloneTrajectory(source.trajectory), radius };
}

export interface ActiveQftHands {
  left: QftTrajectory;
  right?: QftTrajectory;
}

export function buildActiveHands(
  handCount: QftHandCount,
  leftSelection: QftSessionHand,
  rightSelection: QftSessionHand,
  vtgMode: VtgMode,
  originPhase: number
): ActiveQftHands {
  const left = resolveSessionHand(leftSelection);

  if (handCount === "one") {
    return { left: withTrajectoryPhase(left, originPhase) };
  }

  const related = relateTrajectories(
    left,
    resolveSessionHand(rightSelection),
    vtgMode
  );
  return {
    left: withTrajectoryPhase(related.left, originPhase),
    right: withTrajectoryPhase(related.right, originPhase),
  };
}

export function activeHandsAreValid(hands: ActiveQftHands): boolean {
  return (
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
    activeHandsAreValid(buildActiveHands(handCount, left, right, vtgMode, phase))
  );
}

export function validVtgModes(
  left: QftSessionHand,
  right: QftSessionHand,
  originPhase: number
): VtgMode[] {
  return MODE_ORDER.filter((mode) =>
    activeHandsAreValid(buildActiveHands("two", left, right, mode, originPhase))
  );
}

export function selectedPresetId(hand: QftSessionHand): string | null {
  return hand.source.kind === "preset" ? hand.source.id : null;
}

export function selectedFlowerIndex(hand: QftSessionHand): number | null {
  return hand.source.kind === "flower" ? hand.source.index : null;
}
