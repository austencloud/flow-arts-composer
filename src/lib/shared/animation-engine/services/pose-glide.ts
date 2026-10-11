/**
 * Pose glide
 *
 * A transform (mirror, flip, swap, reset or a turn change) replaces the
 * sequence while the player keeps its place, so the props would jump to their
 * new pose in one frame. The workspace pictographs glide their props on the
 * same edits; this is the canvas twin. While it runs, each frame blends from
 * the pose last drawn to the live pose: around the grid for props on the hand
 * points, in a straight line when either end sits off them (dashes), with the
 * staff turning the short way.
 *
 * FrameSystem applies it before the grid join shift, so the blend happens on
 * each hand's own grid. Tunnel copies (additional layers) are not blended.
 */

import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";
import { cssCubicBezier } from "#lib/shared/transitions/ws-ease.js";
import { lerp, lerpAngle } from "./angle-calculator";

/** The workspace props' glide: `--duration-normal` on CSS `ease`. */
export const POSE_GLIDE_MS = DURATION.normal;
const poseGlideEase = cssCubicBezier(0.25, 0.1, 0.25, 1);

export interface PoseGlideProps {
  leftProp: PropState | null;
  rightProp: PropState | null;
}

function blankPose(): PropState {
  return { centerPathAngle: 0, staffRotationAngle: 0 };
}

function copyPose(source: PropState, out: PropState): PropState {
  out.centerPathAngle = source.centerPathAngle;
  out.staffRotationAngle = source.staffRotationAngle;
  out.x = source.x;
  out.y = source.y;
  return out;
}

/** The pose `k` of the way from `from` to `to`, written into `out`. */
export function blendPropState(
  from: PropState,
  to: PropState,
  k: number,
  out: PropState
): PropState {
  out.centerPathAngle = lerpAngle(from.centerPathAngle, to.centerPathAngle, k);
  out.staffRotationAngle = lerpAngle(
    from.staffRotationAngle,
    to.staffRotationAngle,
    k
  );
  const offPoints =
    (from.x !== undefined && from.y !== undefined) ||
    (to.x !== undefined && to.y !== undefined);
  if (offPoints) {
    out.x = lerp(
      from.x ?? Math.cos(from.centerPathAngle),
      to.x ?? Math.cos(to.centerPathAngle),
      k
    );
    out.y = lerp(
      from.y ?? Math.sin(from.centerPathAngle),
      to.y ?? Math.sin(to.centerPathAngle),
      k
    );
  } else {
    out.x = undefined;
    out.y = undefined;
  }
  return out;
}

export class PoseGlide {
  private readonly lastLeft = blankPose();
  private readonly lastRight = blankPose();
  private hasLastLeft = false;
  private hasLastRight = false;
  private readonly fromLeft = blankPose();
  private readonly fromRight = blankPose();
  private hasFromLeft = false;
  private hasFromRight = false;
  private readonly outLeft = blankPose();
  private readonly outRight = blankPose();
  private startMs = 0;
  private durationMs = 0;
  private running = false;

  get active(): boolean {
    return this.running;
  }

  /**
   * Glides from the pose drawn last, so a glide that is still running
   * restarts from where the props are. Nothing drawn yet, or a zero duration
   * (reduced motion), leaves nothing running and the props snap.
   */
  start(nowMs: number, durationMs: number): void {
    this.hasFromLeft = this.hasLastLeft;
    this.hasFromRight = this.hasLastRight;
    if (durationMs <= 0 || (!this.hasFromLeft && !this.hasFromRight)) {
      this.running = false;
      return;
    }
    copyPose(this.lastLeft, this.fromLeft);
    copyPose(this.lastRight, this.fromRight);
    this.startMs = nowMs;
    this.durationMs = durationMs;
    this.running = true;
  }

  /** Ends the glide on the live pose. */
  stop(): void {
    this.running = false;
  }

  /** Forgets the drawn pose, as when the canvas starts over. */
  reset(): void {
    this.running = false;
    this.hasLastLeft = false;
    this.hasLastRight = false;
  }

  /**
   * Replaces this frame's live props with the blended pose while the glide
   * runs, and remembers what will be drawn when `record` is set (a frame with
   * a sequence; the blank pose a host shows between two loads is skipped).
   * Returns true while gliding.
   */
  apply(props: PoseGlideProps, nowMs: number, record: boolean): boolean {
    let gliding = false;
    if (this.running) {
      const t = (nowMs - this.startMs) / this.durationMs;
      if (t >= 1) {
        this.running = false;
      } else {
        const k = poseGlideEase(Math.max(0, t));
        if (props.leftProp && this.hasFromLeft) {
          props.leftProp = blendPropState(
            this.fromLeft,
            props.leftProp,
            k,
            this.outLeft
          );
        }
        if (props.rightProp && this.hasFromRight) {
          props.rightProp = blendPropState(
            this.fromRight,
            props.rightProp,
            k,
            this.outRight
          );
        }
        gliding = true;
      }
    }
    if (record) {
      this.hasLastLeft = props.leftProp !== null;
      this.hasLastRight = props.rightProp !== null;
      if (props.leftProp) copyPose(props.leftProp, this.lastLeft);
      if (props.rightProp) copyPose(props.rightProp, this.lastRight);
    }
    return gliding;
  }
}
