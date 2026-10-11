import type { Quaternion } from "three";

// Bounds include the cup and rolled tip of the shared petal surface.
export function petalGroundClearance(
  size: number,
  orientation: Quaternion
): number {
  const { x, y, z, w } = orientation;
  const axisXy = 2 * (x * y + w * z);
  const axisYy = 1 - 2 * (x * x + z * z);
  const axisZy = 2 * (y * z - w * x);
  const curvedDepth = axisZy >= 0 ? 0.05 * axisZy : -0.3 * axisZy;
  return size * (Math.abs(axisXy) + Math.abs(axisYy) + 2 * curvedDepth);
}
