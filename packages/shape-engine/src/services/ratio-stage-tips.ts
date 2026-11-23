import { getTipPoints } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";

interface StagePoint {
  x: number;
  y: number;
}

/**
 * The tips one hand's prop hands the effect host on the Ratios stage. How many
 * ends give off an effect is the prop's own tip count, the same as on every
 * other stage: a staff gives off from both ends, a poi or a club from its head
 * only, never from the handle in the hand.
 *
 * A lone head is marked `onlyTip`. Some looks ride end B by default, and the
 * shared tip rule lets a look ride a prop's only tip only when the tip says so;
 * without the mark those looks would draw nothing here.
 */
export function ratioStageTips(
  propType: string,
  propIndex: number,
  head: StagePoint,
  tail: StagePoint,
  color: string
): EmitterTip[] {
  const headTip: EmitterTip = { ...head, propIndex, tipIndex: 0, end: "A", color };
  if (getTipPoints(propType).points.length <= 1) {
    return [{ ...headTip, onlyTip: true }];
  }
  return [headTip, { ...tail, propIndex, tipIndex: 1, end: "B", color }];
}
