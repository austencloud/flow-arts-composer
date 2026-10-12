/**
 * The join slide and the join turn for one pictograph, the shared owner of
 * how a joined drawing moves when a sequence edit changes it.
 *
 * Slide: when the same drawing's join changes (the sequence was re-joined,
 * or the change was undone), each hand's grid, props and arrows glide from
 * the old layout to the new one through the shared GridJoinTween instead of
 * jumping. A different drawing (a new sequence, another letter) snaps, the
 * same rule the animation canvas follows.
 *
 * Turn: when a joined drawing's grid mode flips between diamond and box (a
 * rotate of the whole sequence turns the join with every hand location),
 * the joined grids turn 45° about the cell center in the rotation's
 * direction while their outer dots morph between filled and ring, the way
 * GridSvg turns a single grid; the props and arrows move on their own
 * transitions alongside, as they do on one grid.
 *
 * Call during component init. `read` is reactive; a slide or turn starts in
 * a pre-effect, so the frame that first paints the new layout already
 * carries the motion's starting position.
 */
import type { GridJoin } from "@tka/tka-types";
import { isBoxGrid } from "@tka/render-core";
import { motionDuration } from "#lib/shared/transitions/motion.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";
import { cssCubicBezier } from "#lib/shared/transitions/ws-ease.js";
import { getGridRotationDirection } from "#lib/shared/pictograph/grid/state/grid-rotation-state.svelte.js";
import { gridJoinsEqual } from "./grid-join-controller";
import {
  GRID_JOIN_TWEEN_MS,
  GridJoinTween,
  handOffsetsEqual,
  pictographJoinFrame,
  type HandOffsets,
} from "./grid-join-tween";

export interface JoinSlideSource {
  /** The join the pictograph is drawn with now, or null for one grid. */
  readonly join: GridJoin | null;
  readonly gridMode: string | undefined;
  /** Everything the drawing shows apart from its join (`joinSlideDrawingKey`). */
  readonly drawingKey: string;
}

export interface JoinSlideFrame {
  /** Each hand's shown grid offset (scene units) and the shown fit scale. */
  readonly frame: HandOffsets;
  /** Linear progress, 0 at the change and 1 at rest. */
  readonly t: number;
  /** The join the slide left. */
  readonly from: GridJoin | null;
  /** The join it is heading to, which the pictograph is already drawn with. */
  readonly to: GridJoin | null;
  /**
   * How strongly the red hand's own grid shows: it fades in when one grid
   * splits in two and out when two become one, and stays when both ends
   * are joined.
   */
  readonly secondGridAlpha: number;
}

export interface JoinTurnFrame {
  /**
   * Degrees the joined picture is still turned from rest about the scene
   * center (SVG sense, clockwise positive); 0 at rest.
   */
  readonly angle: number;
  /** How much of a ring each outer dot is: 0 a filled dot, 1 a box ring. */
  readonly ring: number;
  /** The shown fit scale about the scene center. */
  readonly scale: number;
}

export interface JoinSlide {
  /** The running slide this frame, or null at rest. */
  readonly current: JoinSlideFrame | null;
  /** The running turn this frame, or null at rest. Never set with `current`. */
  readonly turn: JoinTurnFrame | null;
}

/**
 * The single grid's turn: DURATION.normal on CSS `ease`, the clock and curve
 * GridSvg turns on and the props move on, so the joined grids keep step with
 * the props exactly as one grid does.
 */
export const GRID_TURN_MS = DURATION.normal;
const gridTurnEase = cssCubicBezier(0.25, 0.1, 0.25, 1);
const GRID_TURN_DEGREES = 45;

/**
 * The parts of a pictograph that, when unchanged, make a new join a re-join
 * of the same drawing rather than a different drawing.
 */
export function joinSlideDrawingKey(pictograph: {
  readonly id?: string | null;
  readonly letter?: string | null;
  readonly gridMode?: string | null;
  readonly motions?: Readonly<Record<string, unknown>> | null;
}): string {
  const motion = (hand: string): string => {
    const value = pictograph.motions?.[hand] as
      | Readonly<Record<string, unknown>>
      | undefined;
    if (!value) return "-";
    return [
      value.motionType,
      value.startLocation,
      value.endLocation,
      value.startOrientation,
      value.endOrientation,
      value.rotationDirection,
      value.turns,
      value.propType,
    ].join(",");
  };
  return [
    pictograph.id ?? "",
    pictograph.letter ?? "",
    pictograph.gridMode ?? "",
    motion("left"),
    motion("right"),
  ].join("|");
}

/** Linear in progress, from where the slide began to 1 joined, 0 one grid. */
function secondGridAlphaFor(
  to: GridJoin | null,
  t: number,
  startAlpha: number
): number {
  return startAlpha + ((to ? 1 : 0) - startAlpha) * t;
}

/** True when the two modes draw different grids, one diamond and one box. */
export function flipsDiamondBox(
  from: string | undefined,
  to: string | undefined
): boolean {
  if (from === "skewed" || to === "skewed") return false;
  return isBoxGrid(from) !== isBoxGrid(to);
}

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

export function followJoinSlide(read: () => JoinSlideSource): JoinSlide {
  const tween = new GridJoinTween();
  let current = $state<JoinSlideFrame | null>(null);
  let turn = $state<JoinTurnFrame | null>(null);
  let previous: JoinSlideSource | null = null;
  let frameId: number | null = null;
  let from: GridJoin | null = null;
  let to: GridJoin | null = null;
  let startSecondAlpha = 1;
  let turnRunning = false;
  let turnFrom: JoinTurnFrame = { angle: 0, ring: 0, scale: 1 };
  let turnTo: Pick<JoinTurnFrame, "ring" | "scale"> = { ring: 0, scale: 1 };
  let turnStartMs = 0;
  let turnDurationMs = 0;

  function stopLoop(): void {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  }

  function sampleAt(now: number): JoinSlideFrame | null {
    const sample = tween.sample(now);
    if (!sample || sample.t >= 1) {
      tween.stop();
      return null;
    }
    return {
      frame: sample.offsets,
      t: sample.t,
      from,
      to,
      secondGridAlpha: secondGridAlphaFor(to, sample.t, startSecondAlpha),
    };
  }

  function sampleTurnAt(now: number): JoinTurnFrame | null {
    if (!turnRunning) return null;
    const t = clamp01((now - turnStartMs) / turnDurationMs);
    if (t >= 1) {
      turnRunning = false;
      return null;
    }
    const eased = gridTurnEase(t);
    return {
      angle: turnFrom.angle * (1 - eased),
      ring: turnFrom.ring + (turnTo.ring - turnFrom.ring) * eased,
      scale: turnFrom.scale + (turnTo.scale - turnFrom.scale) * eased,
    };
  }

  function tick(now: number): void {
    current = sampleAt(now);
    turn = sampleTurnAt(now);
    frameId = current || turn ? requestAnimationFrame(tick) : null;
  }

  function settle(): void {
    tween.stop();
    turnRunning = false;
    stopLoop();
    current = null;
    turn = null;
  }

  /**
   * Starts the turn from the picture on screen: the old layout, which the new
   * one is turned 45° from, or wherever a running turn had got to. A second
   * rotate mid-turn (or the first one undone) carries on from there, so the
   * picture never jumps.
   */
  function startTurn(last: JoinSlideSource, next: JoinSlideSource): void {
    const duration = motionDuration(GRID_TURN_MS);
    if (duration <= 0) {
      settle();
      return;
    }
    const now = performance.now();
    const shown = turn;
    const toBox = isBoxGrid(next.gridMode);
    turnFrom = {
      angle:
        (shown?.angle ?? 0) - GRID_TURN_DEGREES * getGridRotationDirection(),
      ring: shown?.ring ?? (toBox ? 0 : 1),
      scale:
        shown?.scale ??
        pictographJoinFrame(last.join, last.gridMode).scale ??
        1,
    };
    turnTo = {
      ring: toBox ? 1 : 0,
      scale: pictographJoinFrame(next.join, next.gridMode).scale ?? 1,
    };
    turnStartMs = now;
    turnDurationMs = duration;
    turnRunning = true;
    tween.stop();
    current = null;
    turn = sampleTurnAt(now);
    stopLoop();
    if (turn) frameId = requestAnimationFrame(tick);
  }

  $effect.pre(() => {
    const next = read();
    const last = previous;
    previous = next;
    if (!last) return;
    if (gridJoinsEqual(last.join, next.join) && last.gridMode === next.gridMode)
      return;
    if (
      last.join &&
      next.join &&
      flipsDiamondBox(last.gridMode, next.gridMode)
    ) {
      startTurn(last, next);
      return;
    }
    const nextFrame = pictographJoinFrame(next.join, next.gridMode);
    const lastFrame = pictographJoinFrame(last.join, last.gridMode);
    const duration = motionDuration(GRID_JOIN_TWEEN_MS);
    if (
      last.drawingKey !== next.drawingKey ||
      duration <= 0 ||
      handOffsetsEqual(lastFrame, nextFrame)
    ) {
      settle();
      return;
    }
    const now = performance.now();
    startSecondAlpha = current ? current.secondGridAlpha : last.join ? 1 : 0;
    from = last.join;
    to = next.join;
    tween.start(lastFrame, nextFrame, now, duration);
    turnRunning = false;
    turn = null;
    current = sampleAt(now);
    stopLoop();
    if (current) frameId = requestAnimationFrame(tick);
  });

  $effect(() => stopLoop);

  return {
    get current() {
      return current;
    },
    get turn() {
      return turn;
    },
  };
}
