import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { interpolatePropAngles } from "$lib/shared/animation-engine/services/prop-interpolator";
import { applySequencePathPreview } from "$lib/shared/sequence-viewer/services/sequence-path-policy";

export type ComparisonHand = "left" | "right";

export function comparisonVariants(sequence: SequenceData) {
  return {
    arc: applySequencePathPreview(sequence, {
      pathShape: "arc",
      motionAwarePaths: false,
    })!,
    concave: applySequencePathPreview(sequence, {
      pathShape: "concave",
      motionAwarePaths: false,
    })!,
  };
}

export function comparisonChoices(sequence: SequenceData) {
  return sequence.steps.flatMap((step, index) =>
    (["left", "right"] as const).flatMap((hand) => {
      const motion = step.motions[hand];
      if (!isVisibleMotion(motion)) return [];
      return [
        {
          key: `${index}:${hand}`,
          index,
          hand,
          label: `Step ${index + 1} · ${hand === "left" ? "Left" : "Right"} hand`,
          changes:
            motion.motionType !== MotionType.STATIC &&
            motion.motionType !== MotionType.DASH,
          motionType: motion.motionType,
        },
      ];
    })
  );
}

/** Presentation adapter: all motion geometry remains with the animation engine. */
export function comparisonPoint(
  step: StepData,
  hand: ComparisonHand,
  progress: number
) {
  const result = interpolatePropAngles(
    step,
    Math.max(0, Math.min(1, progress))
  );
  const angles = hand === "left" ? result.leftAngles : result.rightAngles;
  if (!angles) return null;
  return {
    x: 100 * (angles.x ?? Math.cos(angles.centerPathAngle)),
    y: 100 * (angles.y ?? Math.sin(angles.centerPathAngle)),
  };
}

export function comparisonRoute(step: StepData, hand: ComparisonHand) {
  return Array.from({ length: 65 }, (_, i) =>
    comparisonPoint(step, hand, i / 64)
  )
    .filter((point) => point !== null)
    .map(
      (point, i) =>
        `${i === 0 ? "M" : "L"}${point.x.toFixed(3)},${point.y.toFixed(3)}`
    )
    .join(" ");
}

export function comparisonFrame(steps: StepData[], hand: ComparisonHand) {
  const points = steps
    .flatMap((step) =>
      Array.from({ length: 65 }, (_, i) => comparisonPoint(step, hand, i / 64))
    )
    .filter((point) => point !== null);
  if (!points.length) return "-140 -140 280 280";
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const size = Math.max(100, maxX - minX, maxY - minY) + 80;
  return `${(minX + maxX - size) / 2} ${(minY + maxY - size) / 2} ${size} ${size}`;
}
