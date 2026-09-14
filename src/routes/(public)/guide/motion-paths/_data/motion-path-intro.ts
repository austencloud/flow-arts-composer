import { interpolatePropAngles } from "$lib/shared/animation-engine/services/prop-interpolator";
import { motionPathExamples } from "./motion-path-examples";

export type IntroPath = "arc" | "linear" | "concave";
export interface IntroPoint {
  x: number;
  y: number;
}

export const INTRO_RADIUS = 110;
export const INTRO_CENTER: IntroPoint = { x: 0, y: 0 };

function sampleRoute(pathShape: IntroPath): IntroPoint[] {
  const source = motionPathExamples[2]!.steps[0]!;
  const step = {
    ...source,
    motions: {
      left: { ...source.motions.left, pathShape },
      right: { ...source.motions.right, pathShape },
    },
  };
  // Preserve the engine's center and cardinal directions: this is an
  // east-to-south shift, not a route rotated onto opposite grid points.
  return Array.from({ length: 65 }, (_, index) => {
    const angles = interpolatePropAngles(step, index / 64).leftAngles!;
    return {
      x: INTRO_RADIUS * (angles.x ?? Math.cos(angles.centerPathAngle)),
      y: INTRO_RADIUS * (angles.y ?? Math.sin(angles.centerPathAngle)),
    };
  });
}

export const INTRO_PATHS: Record<IntroPath, readonly IntroPoint[]> = {
  arc: sampleRoute("arc"),
  linear: sampleRoute("linear"),
  concave: sampleRoute("concave"),
};

export function introPointAt(
  points: readonly IntroPoint[],
  progress: number
): IntroPoint {
  const position = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  const index = Math.floor(position);
  const start = points[index]!;
  const end = points[Math.min(index + 1, points.length - 1)]!;
  const fraction = position - index;
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
  };
}

export function introPathD(points: readonly IntroPoint[]): string {
  return points
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${point.x.toFixed(3)},${point.y.toFixed(3)}`
    )
    .join(" ");
}
