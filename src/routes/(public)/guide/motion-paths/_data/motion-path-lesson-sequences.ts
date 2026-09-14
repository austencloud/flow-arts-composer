import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { applySequencePathPreview } from "$lib/shared/sequence-viewer/services/sequence-path-policy";
import { motionPathExamples } from "./motion-path-examples";

export type MotionPathLessonShape = "arc" | "linear" | "concave" | "hybrid";

function pathPolicy(shape: MotionPathLessonShape) {
  return {
    pathShape: shape === "hybrid" ? "arc" : shape,
    motionAwarePaths: shape === "hybrid",
  } as const;
}

/**
 * The lesson shows one existing hand in isolation. Its companion is the
 * sequence's normal invisible-placeholder shape, so the motion data itself is
 * still the frozen guide example rather than a second hand-built sequence.
 */
export function singleHandPathExample(
  shape: MotionPathLessonShape
): SequenceData {
  const source = motionPathExamples[2]!;
  const preview = applySequencePathPreview(source, pathPolicy(shape))!;
  return {
    ...preview,
    id: `${preview.id}-single-left-${shape}`,
    startPosition: preview.startPosition
      ? {
          ...preview.startPosition,
          motions: {
            ...preview.startPosition.motions,
            right: {
              ...preview.startPosition.motions?.right,
              isVisible: false,
            },
          },
        }
      : preview.startPosition,
    steps: preview.steps.map((step) => ({
      ...step,
      motions: {
        ...step.motions,
        right: { ...step.motions?.right, isVisible: false },
      },
    })),
  };
}

/** Both comparison panes are derived from the same frozen sequence. */
export function pathJoinExample(shape: "arc" | "concave"): SequenceData {
  const source = motionPathExamples[2]!;
  const preview = applySequencePathPreview(source, pathPolicy(shape))!;
  return { ...preview, id: `${preview.id}-join-${shape}` };
}
