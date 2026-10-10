import { TrackingMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import {
  setCellWide,
  type TipEffectMap,
} from "#lib/shared/animation-engine/services/tip-effect-resolver.js";
import { pairTipEnds } from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";

/**
 * Trail settings choose where the live overlay captures a prop. The effect map
 * separately turns that overlay on, so Fuse needs both even though it has no
 * trail controls of its own.
 */
export const FUSE_PREVIEW_TIP_EFFECT_MAP: TipEffectMap = setCellWide(
  {},
  "trails"
);

export function resolveFusePreviewTrackingMode(
  leftPropType: string | undefined,
  rightPropType: string | undefined
): TrackingMode {
  return pairTipEnds(leftPropType, rightPropType) === 2
    ? TrackingMode.BOTH_ENDS
    : TrackingMode.RIGHT_END;
}
