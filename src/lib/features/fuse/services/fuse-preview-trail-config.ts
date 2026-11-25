import { TrackingMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { pairTipEnds } from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";

/**
 * Where the live trail captures each prop in the Fuse preview. Which effect is
 * on, and how it looks, comes from the person's effects state like every other
 * player; this only keeps the capture point on the Choreo Card's prop
 * contract: unilateral props trace one central tip, bilateral props both.
 */
export function resolveFusePreviewTrackingMode(
  leftPropType: string | undefined,
  rightPropType: string | undefined
): TrackingMode {
  return pairTipEnds(leftPropType, rightPropType) === 2
    ? TrackingMode.BOTH_ENDS
    : TrackingMode.RIGHT_END;
}
