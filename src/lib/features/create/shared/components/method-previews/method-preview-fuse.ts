/**
 * The Create front door's Fuse preview: the fused steps it plays, where each
 * one-hand source sits and lands, and the scene's beats. Pure, so tests check
 * them without drawing.
 */
import {
  resolveFusePictographMotionFrame,
  type FusePictographMotionFrame,
} from "$lib/features/fuse/services/fuse-pictograph-motion-frame";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  transformOnto,
  type CellRect,
  type FuseLayout,
} from "./method-preview-compositions";

/** The scene's beats, in milliseconds, in the order they play. */
export const FUSE_PREVIEW_TIMING = Object.freeze({
  /** The finished fused steps fade out. */
  clearMs: 150,
  /** The blue and red sources fade in, apart. */
  sourcesInMs: 300,
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
 * previous step's end, or the start position for the first step), and the
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
