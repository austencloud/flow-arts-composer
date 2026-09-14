import { interpolatePropAngles } from "$lib/shared/animation-engine/services/prop-interpolator";
import { motionPathExamples } from "./motion-path-examples";

export type IntroPath = "arc" | "linear" | "concave";
export interface IntroPoint {
  x: number;
  y: number;
}

function sampleRoute(pathShape: IntroPath): IntroPoint[] {
  const source = motionPathExamples[2]!.steps[0]!;
  const step = {
    ...source,
    motions: {
      left: { ...source.motions.left, pathShape },
      right: { ...source.motions.right, pathShape },
    },
  };
  const points = Array.from({ length: 65 }, (_, index) => {
    const angles = interpolatePropAngles(step, index / 64).leftAngles!;
    return {
      x: angles.x ?? Math.cos(angles.centerPathAngle),
      y: angles.y ?? Math.sin(angles.centerPathAngle),
    };
  });
  const start = points[0]!;
  const end = points.at(-1)!;
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const ux = (end.x - start.x) / distance;
  const uy = (end.y - start.y) / distance;
  // Rotate the engine's quarter-turn onto a horizontal baseline for the lesson.
  // This changes the presentation, never the shape of the hand's route.
  return points.map((point) => {
    const x = point.x - (start.x + end.x) / 2;
    const y = point.y - (start.y + end.y) / 2;
    return {
      x: ((x * ux + y * uy) * 280) / distance,
      y: ((-x * uy + y * ux) * 280) / distance,
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
