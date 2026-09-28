import { getTipPoints } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import { getBilateralEndLabels } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
import { basePropTypeOfRenderKey } from "$lib/shared/pictograph/prop/domain/prop-look";

/**
 * Display name for one tip of a prop. `tipIndex` indexes getTipPoints(propType),
 * the same index the per-tip effect keys ("0-1") and the renderers use.
 *
 * A two-tip prop's tips are its LEFT_END (0) and RIGHT_END (1), the order
 * getDefaultTrailPointConfig assigns them, so they take the end names every
 * other end picker shows. On a staff that makes tip 0 (-x) the Pinky and tip 1
 * (+x) the Thumb: the crossbar is drawn at +x, and "in" turns +x toward the
 * centre. Props without a named pair read End 1 / End 2.
 */
export function getTipLabel(propType: string, tipIndex: number): string {
  const tipCount = getTipPoints(propType).points.length;
  if (tipCount === 1) return "Tip";
  if (tipCount === 2) {
    const [leftEnd, rightEnd] = getBilateralEndLabels(
      basePropTypeOfRenderKey(propType)
    );
    return (tipIndex === 0 ? leftEnd : rightEnd).replace(/ End$/, "");
  }
  return `Tip ${tipIndex + 1}`;
}
