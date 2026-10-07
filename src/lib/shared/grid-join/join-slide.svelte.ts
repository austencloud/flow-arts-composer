/**
 * The join slide for one pictograph. When the same drawing's join changes
 * (the sequence was re-joined, or the change was undone), each hand's grid,
 * props and arrows glide from the old layout to the new one through the
 * shared GridJoinTween instead of jumping. A different drawing (a new
 * sequence, another letter, a transform) snaps, the same rule the animation
 * canvas follows.
 *
 * Call during component init. `read` is reactive; the slide starts in a
 * pre-effect, so the frame that first paints the new layout already carries
 * the slide's starting position.
 */
import type { GridJoin } from "@tka/tka-types";
import { motionDuration } from "$lib/shared/transitions/motion";
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

export interface JoinSlide {
  /** The running slide this frame, or null at rest. */
  readonly current: JoinSlideFrame | null;
}

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

export function followJoinSlide(read: () => JoinSlideSource): JoinSlide {
  const tween = new GridJoinTween();
  let current = $state<JoinSlideFrame | null>(null);
  let previous: JoinSlideSource | null = null;
  let frameId: number | null = null;
  let from: GridJoin | null = null;
  let to: GridJoin | null = null;
  let startSecondAlpha = 1;

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

  function tick(now: number): void {
    current = sampleAt(now);
    frameId = current ? requestAnimationFrame(tick) : null;
  }

  $effect.pre(() => {
    const next = read();
    const last = previous;
    previous = next;
    if (!last) return;
    if (gridJoinsEqual(last.join, next.join) && last.gridMode === next.gridMode)
      return;
    const nextFrame = pictographJoinFrame(next.join, next.gridMode);
    const lastFrame = pictographJoinFrame(last.join, last.gridMode);
    const duration = motionDuration(GRID_JOIN_TWEEN_MS);
    if (
      last.drawingKey !== next.drawingKey ||
      duration <= 0 ||
      handOffsetsEqual(lastFrame, nextFrame)
    ) {
      tween.stop();
      stopLoop();
      current = null;
      return;
    }
    const now = performance.now();
    startSecondAlpha = current ? current.secondGridAlpha : last.join ? 1 : 0;
    from = last.join;
    to = next.join;
    tween.start(lastFrame, nextFrame, now, duration);
    current = sampleAt(now);
    stopLoop();
    if (current) frameId = requestAnimationFrame(tick);
  });

  $effect(() => stopLoop);

  return {
    get current() {
      return current;
    },
  };
}
