/**
 * Derive a PropGeometryKey from pictograph + motion context.
 *
 * Extracted from ArrowAdjustmentCalculator.lookupPropGeometryAdjustment so the
 * inspect-panel editor and the rendering pipeline build identical keys.
 * Returns null when the scenario can't form a full key (missing motion or endPlacement).
 */
import { deriveGridMode as _deriveGridMode } from "$lib/shared/pictograph/grid/services/grid-mode-deriver";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PropGeometryKey } from "./prop-geometry-adjustment";
import { createCanonicalPlacementContext } from "../../calculation/services/canonical-placement-frame";
import { placementFrameForGridMode } from "../../placement/domain/placement-frame";
import {
  HandSide,
  normalizeLegacyHandSide,
  type HandSide as HandSideValue,
} from "@tka/tka-types";

export function derivePropGeometryKey(
  pictographData: PictographData,
  motionData: MotionData,
  arrowHand?: HandSideValue | "blue" | "red"
): PropGeometryKey | null {
  const canonicalContext = createCanonicalPlacementContext(
    pictographData,
    motionData
  );
  pictographData = canonicalContext.pictographData;
  motionData = canonicalContext.motionData;
  const leftMotion = pictographData.motions.left;
  const rightMotion = pictographData.motions.right;
  if (!leftMotion || !rightMotion) return null;

  const placementFrame = placementFrameForGridMode(
    _deriveGridMode(leftMotion, rightMotion)
  );

  const endPlacement = pictographData.endPlacement;
  if (!endPlacement) return null;
  const positionType = endPlacement.replace(/\d+$/, "");

  const hand =
    normalizeLegacyHandSide(arrowHand ?? motionData.hand) ?? HandSide.LEFT;
  const isLeft = hand === HandSide.LEFT;
  const thisMotion = isLeft ? leftMotion : rightMotion;
  const otherMotion = isLeft ? rightMotion : leftMotion;

  return {
    placementFrame,
    propType: thisMotion.propType?.toLowerCase() || "staff",
    otherPropType: otherMotion.propType?.toLowerCase() || "staff",
    positionType,
    endOrientation: thisMotion.endOrientation?.toLowerCase() || "in",
    otherEndOrientation: otherMotion.endOrientation?.toLowerCase() || "in",
    motionType: motionData.motionType?.toLowerCase() || "static",
    turns: String(motionData.turns ?? 0),
    arrowColor: hand,
  };
}
