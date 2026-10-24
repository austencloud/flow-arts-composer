/**
 * How anything that builds a sequence asks "what turn does this step get?".
 *
 * Two kinds answer that question and they differ in one way that matters. A
 * random allocation is a fixed-length array decided up front, so once the
 * search inserts bridge steps and runs past that length it has nothing left to
 * give. A pattern is a period: it is indexed modulo its own length, so it
 * answers at every index that will ever exist, bridges included.
 */

import type { TurnAllocation } from "./TurnAllocator.js";
import { normalizeLegacyHandPair } from "@tka/tka-types";

/**
 * Derived from the allocator rather than declared again. There are already
 * four separate `TurnValue` declarations in this repo and a fifth would be one
 * more thing to keep in step.
 */
export type TurnValue = TurnAllocation["left"][number];
export type TurnHand = "left" | "right";

export interface TurnLanes {
  readonly left: readonly TurnValue[];
  readonly right: readonly TurnValue[];
}

export interface TurnSource {
  at(stepIndex: number, hand: TurnHand): TurnValue | undefined;
}

/** Fixed-length allocation. Runs out past its end, which is today's behaviour. */
export function allocationSource(lanes: TurnLanes): TurnSource {
  const normalizedLanes = normalizeLegacyHandPair(lanes);
  return {
    at(stepIndex, hand) {
      const lane = normalizedLanes[hand];
      if (stepIndex < 0 || stepIndex >= lane.length) return undefined;
      return lane[stepIndex];
    },
  };
}

/**
 * Random allocation that keeps going. The up-front lanes answer their own
 * indices exactly as `allocationSource` would; past their end each new step is
 * rolled once, in index order, and remembered, so a bridge step the search
 * inserted gets a turn from the same pool and every later look at that index
 * sees the same value.
 */
export function growingAllocationSource(
  lanes: TurnLanes,
  rollStep: () => { left: TurnValue; right: TurnValue }
): TurnSource {
  const normalizedLanes = normalizeLegacyHandPair(lanes);
  const left = [...normalizedLanes.left];
  const right = [...normalizedLanes.right];
  return {
    at(stepIndex, hand) {
      if (stepIndex < 0) return undefined;
      // An allocation's lanes are the same length; if they ever are not, the
      // shorter one is filled from the front of the roll rather than skipped.
      while (left.length <= stepIndex || right.length <= stepIndex) {
        const step = rollStep();
        if (left.length <= stepIndex) left.push(step.left);
        if (right.length <= stepIndex) right.push(step.right);
      }
      return (hand === "left" ? left : right)[stepIndex];
    },
  };
}

/** Repeating period. Never runs out. */
export function patternSource(lanes: TurnLanes): TurnSource {
  const normalizedLanes = normalizeLegacyHandPair(lanes);
  return {
    at(stepIndex, hand) {
      const lane = normalizedLanes[hand];
      if (lane.length === 0 || stepIndex < 0) return undefined;
      return lane[stepIndex % lane.length];
    },
  };
}
