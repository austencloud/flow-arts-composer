/**
 * Draws a player's opt-in motion cues on the main 2D canvas (see
 * motion-cue-types.ts): ghost copies and the hand path under the props, the
 * hand dot and thumb ring over them. Nothing here runs unless a frame carries
 * a MotionCueFrame.
 */

import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import {
  MOTION_CUE_GHOST_ALPHAS,
  MOTION_CUE_GHOST_TIMES,
  MOTION_CUE_HAND_COLOR,
  MOTION_CUE_PATH_SAMPLES,
  MOTION_CUE_THUMB_COLOR,
  motionCueProgress,
  visibleGhostIndexes,
  type MotionCueFrame,
  type MotionCueSide,
} from "../../domain/types/motion-cue-types";
import {
  calculatePropCenter,
  calculateTrailSourceEndpoint,
  type PropEndpointResult,
} from "../prop-position-calculator";

/** The staff's thumb end is its tip 1: the +x end of the sprite, where the
 * crossbar is drawn. Orientation "in" points this end at the grid centre. */
export const THUMB_TIP_INDEX = 1;

/** Where the thumb ring sits for a pose, in canvas pixels. */
export function thumbRingCenter(
  prop: PropState,
  canvasSize: number,
  propType?: string | null,
  flipped = false
): PropEndpointResult {
  const point = calculateTrailSourceEndpoint(
    prop,
    { canvasSize, propDimensions: { width: 0, height: 0 }, flipped },
    { type: "tip", index: THUMB_TIP_INDEX },
    propType
  );
  return point ?? calculatePropCenter(prop, { canvasSize, propDimensions: { width: 0, height: 0 } });
}

/** Mark sizes as fractions of the canvas (the review mock's 208-unit box:
 * dot r 5.2, ring r 8.5, path ~2.6 wide). */
const DOT_RADIUS = 5.2 / 208;
const RING_RADIUS = 8.5 / 208;
const PATH_WIDTH = 2.6 / 208;
const RING_FILL = "rgba(234, 179, 8, 0.16)";
const MARK_STROKE = "rgba(8, 12, 20, 0.85)";

export interface MotionCueSideDraw {
  prop: PropState | null;
  side: MotionCueSide | null;
  visible: boolean;
  propType?: string;
  flipped?: boolean;
  /** Draw this hand's sprite at a pose with the current globalAlpha. */
  drawSprite: (pose: PropState) => void;
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  side: MotionCueSide,
  live: PropState | null,
  progress: number,
  canvasSize: number
): void {
  const config = { canvasSize, propDimensions: { width: 0, height: 0 } };
  const last = Math.floor(progress * MOTION_CUE_PATH_SAMPLES);
  if (last < 0 || side.path.length === 0) return;
  ctx.save();
  ctx.strokeStyle = MOTION_CUE_HAND_COLOR;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(1.5, canvasSize * PATH_WIDTH);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const first = calculatePropCenter(side.path[0]!, config);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i <= last && i < side.path.length; i++) {
    const point = calculatePropCenter(side.path[i]!, config);
    ctx.lineTo(point.x, point.y);
  }
  // Mid-play the line runs on to the hand itself, not the last sample.
  if (progress < 1 && live) {
    const hand = calculatePropCenter(live, config);
    ctx.lineTo(hand.x, hand.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Ghosts and hand path, drawn after the trails and before the props. */
export function drawMotionCuesUnder(
  ctx: CanvasRenderingContext2D,
  frame: MotionCueFrame,
  currentStep: number,
  canvasSize: number,
  sides: readonly MotionCueSideDraw[]
): void {
  const progress = motionCueProgress(
    currentStep,
    frame.stepCount,
    frame.everPlayed
  );
  for (const entry of sides) {
    if (!entry.visible || !entry.side) continue;
    if (frame.ghosts) {
      const shown = visibleGhostIndexes(MOTION_CUE_GHOST_TIMES, progress);
      for (const index of shown) {
        const pose = entry.side.ghosts[index];
        if (!pose) continue;
        ctx.save();
        ctx.globalAlpha *= MOTION_CUE_GHOST_ALPHAS[index] ?? 0.25;
        entry.drawSprite(pose);
        ctx.restore();
      }
    }
    if (frame.handPath) {
      drawPath(ctx, entry.side, entry.prop, progress, canvasSize);
    }
  }
}

/** Hand dot and thumb ring, drawn over the props. */
export function drawMotionCuesOver(
  ctx: CanvasRenderingContext2D,
  frame: MotionCueFrame,
  canvasSize: number,
  sides: readonly MotionCueSideDraw[]
): void {
  const config = { canvasSize, propDimensions: { width: 0, height: 0 } };
  for (const entry of sides) {
    if (!entry.visible || !entry.side || !entry.prop) continue;
    ctx.save();
    ctx.lineWidth = Math.max(1, canvasSize * (1.4 / 208));
    ctx.strokeStyle = MARK_STROKE;
    if (frame.thumbRing) {
      const thumb = thumbRingCenter(
        entry.prop,
        canvasSize,
        entry.propType,
        entry.flipped
      );
      const r = canvasSize * RING_RADIUS;
      ctx.beginPath();
      ctx.arc(thumb.x, thumb.y, r, 0, Math.PI * 2);
      ctx.fillStyle = RING_FILL;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, canvasSize * (2.2 / 208));
      ctx.strokeStyle = MOTION_CUE_THUMB_COLOR;
      ctx.stroke();
    }
    if (frame.handPath) {
      const hand = calculatePropCenter(entry.prop, config);
      ctx.beginPath();
      ctx.arc(hand.x, hand.y, canvasSize * DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = MOTION_CUE_HAND_COLOR;
      ctx.fill();
      ctx.lineWidth = Math.max(1, canvasSize * (1.4 / 208));
      ctx.strokeStyle = MARK_STROKE;
      ctx.stroke();
    }
    ctx.restore();
  }
}
