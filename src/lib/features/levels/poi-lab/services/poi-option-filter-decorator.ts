/**
 * Poi Option Filter Decorator
 *
 * Filters pictograph options to only poi-legal moves, evaluated per hand. A hand
 * is constrained only when its active prop type is poi; an absent motion imposes
 * no constraint (single-hand steps). Neither hand poi → no filtering.
 *
 * Active prop types are passed in rather than read off the motion: raw options
 * are not stamped with the user's prop type until later (prepareBatch), so the
 * legality decision must come from the current settings.
 */

import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { validateMotion, validateTransition } from "./poi-constraint-validator";

export interface ActivePropTypes {
  // A hand may have no prop type set; only `PropType.POI` is constrained, so an
  // undefined type is treated as "not poi" (no constraint).
  leftPropType: PropType | undefined;
  rightPropType: PropType | undefined;
}

export class PoiOptionFilterDecorator {
  filterPoiLegalOptions(
    options: readonly PictographData[],
    previousPictograph: PictographData | null,
    activeProps: ActivePropTypes
  ): PictographData[] {
    const leftIsPoi = activeProps.leftPropType === PropType.POI;
    const rightIsPoi = activeProps.rightPropType === PropType.POI;

    // Neither hand is poi — nothing to constrain.
    if (!leftIsPoi && !rightIsPoi) {
      return [...options];
    }

    return options.filter((option) => {
      if (
        leftIsPoi &&
        !this.isHandLegal(option.motions?.left, previousPictograph?.motions?.left)
      ) {
        return false;
      }
      if (
        rightIsPoi &&
        !this.isHandLegal(option.motions?.right, previousPictograph?.motions?.right)
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * A poi hand is legal when its motion (if present) is a legal poi motion and,
   * when a previous beat exists, the transition into it is legal. An absent
   * motion imposes no constraint.
   */
  private isHandLegal(
    motion: MotionData | undefined,
    previousMotion: MotionData | undefined
  ): boolean {
    if (!motion) return true;
    if (!validateMotion(motion).isValid) return false;
    if (previousMotion && !validateTransition(previousMotion, motion).isValid) {
      return false;
    }
    return true;
  }
}
