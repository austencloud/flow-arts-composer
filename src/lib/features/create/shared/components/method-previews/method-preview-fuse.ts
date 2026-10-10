/**
 * The Create front door's Fuse preview: the fused steps it plays, where each
 * one-hand source sits and lands, and the scene's beats. Pure, so tests check
 * them without drawing.
 */
import {
  resolveFusePictographMotionFrame,
  type FusePictographMotionFrame,
} from "#lib/features/fuse/services/fuse-pictograph-motion-frame.js";
import type { FuseSide } from "#lib/features/fuse/state/fuse-shuffle-pool.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  transformOnto,
  type CellRect,
  type FuseLayout,
} from "./method-preview-compositions";
import { DEMO_STEP_START } from "./method-preview-demo";

/** The scene's beats, in milliseconds, in the order they play. */
export const FUSE_PREVIEW_TIMING = Object.freeze({
  /** The finished fused steps fade out. */
  clearMs: 150,
  /** The blue and red sources fade in, apart. */
  sourcesInMs: 300,
  /**
   * A new path's halves arrive over the end of sourcesInMs with a small
   * pop, after the kept hand's, so the eye finds what changed.
   */
  newHandMs: 180,
  /** They slide together, each half onto its fused cell. */
  slideMs: 520,
  /** The fused cells take over from the halves. */
  mergeMs: 120,
  /** Each fused step plays. */
  stepMs: 650,
});

/**
 * `count` steps from index `from`, each at the start of its travel, through
 * Fuse's own motion seam: the step, the pose its props leave from (the
 * previous step's end, or the start position for step 0), and the
 * progress Fuse's cards play on.
 */
export function fuseFrames(
  sequence: SequenceData,
  count: number,
  from = 0
): FusePictographMotionFrame[] {
  const frames: FusePictographMotionFrame[] = [];
  for (let index = from; index < from + count; index++) {
    const frame = resolveFusePictographMotionFrame(sequence, index);
    if (frame) frames.push(frame);
  }
  return frames;
}

/**
 * How long a turn waits for cells still drawing a new pair before it plays
 * what they show.
 */
export const FUSE_PREVIEW_DRAW_WAIT_MS = 200;

/** Regenerate gives red a new path first, then blue, taking turns. */
export const FIRST_FUSE_SWAP: FuseSide = "right";

/** The hand that gets a new path after `side`. */
export function nextFuseSwap(side: FuseSide): FuseSide {
  return side === "left" ? "right" : "left";
}

/** How many fused steps the scene plays. */
export const FUSE_PREVIEW_STEPS = 2;

/**
 * The fused steps the scene plays from a sequence: two steps from Fuse's
 * place in the demo (DEMO_STEP_START.fuse), so a new pair's kept hand shows
 * the very steps it showed before.
 */
export function fusePreviewFrames(
  sequence: SequenceData
): FusePictographMotionFrame[] {
  return fuseFrames(sequence, FUSE_PREVIEW_STEPS, DEMO_STEP_START.fuse);
}

/** One hand of one step, before it fuses. */
export interface FuseSource {
  key: string;
  hand: HandSide;
  /** The fused step this source is one hand of. */
  step: number;
  rect: CellRect;
  /** The transform that lands it on its fused cell. */
  slide: string;
  /**
   * True for the half drawn later in its step, which stacks over the other.
   * It floats its pictograph over the other half's cell, so both props show
   * as they meet instead of one cell hiding the other.
   */
  onTop: boolean;
}

/** The blue sources, then the red ones, each paired with its fused cell. */
export function fuseSources(layout: FuseLayout): FuseSource[] {
  const side = (
    hand: HandSide,
    rects: CellRect[]
  ): Omit<FuseSource, "onTop">[] =>
    rects.flatMap((rect, step) => {
      const target = layout.combined[step];
      return target
        ? [
            {
              key: `${hand}:${step}`,
              hand,
              step,
              rect,
              slide: transformOnto(rect, target),
            },
          ]
        : [];
    });
  const ordered = [
    ...side(HandSide.LEFT, layout.blue),
    ...side(HandSide.RIGHT, layout.red),
  ];
  // Later in the list draws later, so it stacks over the earlier half.
  const lastOfStep = new Map<number, number>();
  ordered.forEach((source, index) => lastOfStep.set(source.step, index));
  return ordered.map((source, index) => ({
    ...source,
    onTop: lastOfStep.get(source.step) === index,
  }));
}
