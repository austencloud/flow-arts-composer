/**
 * The slide between two grid layouts, the one owner of the join slide. When a
 * sequence's join changes, each hand's grid, prop, arrow, trail and path line
 * glides from where it sat to where the new join puts it, so the change shows
 * instead of jumping. The animation canvas and every pictograph run it.
 *
 * Offsets are per hand and {0, 0} for one grid, in the caller's unit: the
 * canvas uses hand-point radii (the unit of prop x/y), pictographs use scene
 * units with the joined fit scale alongside. Time is wall-clock milliseconds,
 * never playback time, so the slide runs the same playing or paused.
 */
import { cubicInOut } from "svelte/easing";
import type { GridJoin } from "@tka/tka-types";
import {
  getGridJoinLayout,
  gridJoinOffsets,
  type JoinVec,
} from "@tka/render-core";

export interface HandOffsets {
  readonly left: JoinVec;
  readonly right: JoinVec;
  /**
   * The joined fit scale about the scene center, for painters that shrink
   * joined content to clear the cell's edge glyphs. Absent reads as 1.
   */
  readonly scale?: number;
}

/** One grid: both hands at the canvas center. */
export const CENTERED_HAND_OFFSETS: HandOffsets = Object.freeze({
  left: Object.freeze({ x: 0, y: 0 }),
  right: Object.freeze({ x: 0, y: 0 }),
});

/** How long a layout change slides, before reduced motion is applied. */
export const GRID_JOIN_TWEEN_MS = 450;

/** Each hand's resting offset for a join; centered for one grid. */
export function gridJoinHandOffsets(join: GridJoin | null): HandOffsets {
  if (!join) return CENTERED_HAND_OFFSETS;
  const offsets = gridJoinOffsets(join, 1);
  return { left: offsets.left, right: offsets.right };
}

/**
 * A pictograph's resting frame for a join: each hand's grid offset in scene
 * units and the fit scale, as `getGridJoinLayout` draws it. One grid is
 * centered at scale 1.
 */
export function pictographJoinFrame(
  join: GridJoin | null,
  gridMode: string | undefined
): HandOffsets {
  if (!join) return { ...CENTERED_HAND_OFFSETS, scale: 1 };
  const layout = getGridJoinLayout(join, gridMode);
  return {
    left: layout.offsets.left,
    right: layout.offsets.right,
    scale: layout.scale,
  };
}

/** Same frame: offsets and scale all equal. */
export function handOffsetsEqual(a: HandOffsets, b: HandOffsets): boolean {
  return (
    a.left.x === b.left.x &&
    a.left.y === b.left.y &&
    a.right.x === b.right.x &&
    a.right.y === b.right.y &&
    (a.scale ?? 1) === (b.scale ?? 1)
  );
}

export interface GridJoinTweenSample {
  /** Each hand's displayed offset this frame. */
  readonly offsets: HandOffsets;
  /** Linear progress, 0 at the pick and 1 at the end. */
  readonly t: number;
  /** Which slide this is; a retarget starts a new one. */
  readonly id: number;
}

function lerpVec(a: JoinVec, b: JoinVec, k: number): JoinVec {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

export class GridJoinTween {
  private from: HandOffsets = CENTERED_HAND_OFFSETS;
  private to: HandOffsets = CENTERED_HAND_OFFSETS;
  private startMs = 0;
  private durationMs = 0;
  private running = false;
  private slideId = 0;

  get active(): boolean {
    return this.running;
  }

  /**
   * Slides from `from` to `to`. A slide already running restarts from where
   * it is now, so a second pick mid-slide never jumps. A zero duration
   * (reduced motion) leaves nothing running: the layout snaps, as before.
   */
  start(
    from: HandOffsets,
    to: HandOffsets,
    nowMs: number,
    durationMs: number
  ): void {
    const displayed = this.running ? this.offsetsAt(nowMs) : from;
    if (durationMs <= 0) {
      this.running = false;
      return;
    }
    this.from = displayed;
    this.to = to;
    this.startMs = nowMs;
    this.durationMs = durationMs;
    this.running = true;
    this.slideId++;
  }

  /** The running slide this frame, or null when nothing is sliding. */
  sample(nowMs: number): GridJoinTweenSample | null {
    if (!this.running) return null;
    return {
      offsets: this.offsetsAt(nowMs),
      t: this.progressAt(nowMs),
      id: this.slideId,
    };
  }

  /** Ends the slide where it was headed. */
  stop(): void {
    this.running = false;
  }

  private progressAt(nowMs: number): number {
    return clamp01((nowMs - this.startMs) / this.durationMs);
  }

  private offsetsAt(nowMs: number): HandOffsets {
    const t = this.progressAt(nowMs);
    if (t >= 1) return this.to;
    const k = cubicInOut(t);
    const left = lerpVec(this.from.left, this.to.left, k);
    const right = lerpVec(this.from.right, this.to.right, k);
    if (this.from.scale === undefined && this.to.scale === undefined) {
      return { left, right };
    }
    const fromScale = this.from.scale ?? 1;
    const toScale = this.to.scale ?? 1;
    return { left, right, scale: fromScale + (toScale - fromScale) * k };
  }
}

/**
 * How strongly each grid layer shows at progress `t` of a slide: the old
 * still picture fades out over the first third while each hand's moving grid
 * fades in, and the moving grids hand over to the new still picture over the
 * last third, once that picture has loaded. `startOutgoing` and
 * `startMoving` are the layers' strengths when the slide began (1 and 0 for
 * a fresh slide; the shown strengths when a second pick retargets one).
 */
export function gridJoinLayerAlphas(
  t: number,
  compositeReady: boolean,
  startOutgoing = 1,
  startMoving = 0
): { outgoing: number; moving: number; composite: number } {
  const fade = clamp01(t * 3);
  const composite = compositeReady ? clamp01((t - 2 / 3) * 3) : 0;
  const moving = (startMoving + (1 - startMoving) * fade) * (1 - composite);
  return { outgoing: startOutgoing * (1 - fade), moving, composite };
}
