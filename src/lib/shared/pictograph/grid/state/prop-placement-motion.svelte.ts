/**
 * In-place motion for the shared prop placement grid.
 *
 * When a start-position location change commits (rotate arrows in the step
 * editor), the grid plays the move instead of snapping: the moving prop
 * travels a pro-with-zero-turns arc around the grid center and the partner
 * prop glides out of (or into) its beta offset. The animation is pure
 * presentation — the sequence data has already committed before it starts.
 *
 * Rendering rides PictographContainer's motionStartData/motionProgress seam
 * (calculatePictographMotionPositions), so progress 0 and 1 are pixel-identical
 * to the static pictographs on either side and the hand-off back to the normal
 * placement render cannot jump.
 */

import { untrack } from "svelte";
import { cubicInOut } from "svelte/easing";
import type {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  buildPlacementTransition,
  type PlacementTransition,
} from "$lib/shared/pictograph/grid/services/prop-placement-view-model";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  HandSide,
  type Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { reducedMotion } from "$lib/shared/transitions/motion";
import { DURATION } from "$lib/shared/transitions/transitions";

export interface PlacementMotionMove {
  /** Increment per committed move; the state ignores repeats of the same epoch. */
  epoch: number;
  color: HandSide;
  from: GridLocation;
  to: GridLocation;
  direction: "clockwise" | "counterclockwise";
}

interface PlacementMotionDeps {
  getMove: () => PlacementMotionMove | null;
  getGridMode: () => GridMode;
  getLeftPropType: () => PropType;
  getRightPropType: () => PropType;
  getLeftOrientation: () => Orientation;
  getRightOrientation: () => Orientation;
  /** Committed (post-move) locations — the partner prop's spot comes from here. */
  getLeftLocation: () => GridLocation | null;
  getRightLocation: () => GridLocation | null;
  getBetaSwapped: () => boolean;
  getPreviewPictographData: () => StepData | PictographData | null;
}

const MOTION_DURATION_MS = DURATION.dramatic;

export function createPropPlacementMotionState(deps?: PlacementMotionDeps) {
  let transition = $state<PlacementTransition | null>(null);
  let progress = $state(0);
  let lastEpoch = 0;
  let frame = 0;
  let onComplete: (() => void) | undefined;

  function cancelFrame() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function finish() {
    cancelFrame();
    transition = null;
    progress = 0;
    const complete = onComplete;
    onComplete = undefined;
    complete?.();
  }

  /** Hold the exact start pose until the consumer's prepared SVGs are ready. */
  function prepare(value: PlacementTransition, complete?: () => void) {
    cancelFrame();
    transition = value;
    progress = 0;
    onComplete = complete;
  }

  function start() {
    if (!transition || frame) return;
    if (reducedMotion()) {
      finish();
      return;
    }
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = reducedMotion()
        ? 1
        : Math.min(1, (now - startedAt) / MOTION_DURATION_MS);
      progress = cubicInOut(t);
      if (t < 1) frame = requestAnimationFrame(tick);
      else finish();
    };
    frame = requestAnimationFrame(tick);
  }

  function begin(move: PlacementMotionMove) {
    if (!deps) return;
    cancelFrame();
    if (reducedMotion()) {
      finish();
      return;
    }

    const isBlueMoving = move.color === HandSide.LEFT;
    const leftLocation = isBlueMoving ? move.to : deps.getLeftLocation();
    const rightLocation = isBlueMoving ? deps.getRightLocation() : move.to;
    if (!leftLocation || !rightLocation) {
      finish();
      return;
    }

    prepare(
      buildPlacementTransition({
        gridMode: deps.getGridMode(),
        movingColor: move.color,
        fromLocation: move.from,
        toLocation: move.to,
        direction: move.direction,
        leftLocation,
        rightLocation,
        leftOrientation: deps.getLeftOrientation(),
        rightOrientation: deps.getRightOrientation(),
        leftPropType: deps.getLeftPropType(),
        rightPropType: deps.getRightPropType(),
        betaSwapped: deps.getBetaSwapped(),
        previewPictographData: deps.getPreviewPictographData(),
      })
    );
    start();
  }

  /**
   * Call from an $effect. Reacts only to a new move epoch; a move arriving
   * mid-flight snaps the current animation to its end and plays the next.
   */
  function synchronize() {
    const move = deps?.getMove();
    if (!move || move.epoch === lastEpoch) return;
    lastEpoch = move.epoch;
    untrack(() => begin(move));
  }

  function destroy() {
    cancelFrame();
    onComplete = undefined;
  }

  return {
    get active() {
      return transition !== null;
    },
    get step() {
      return transition?.transitionStep ?? null;
    },
    get startData() {
      return transition?.startData ?? null;
    },
    get progress() {
      return progress;
    },
    synchronize,
    prepare,
    start,
    destroy,
  };
}
