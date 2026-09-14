import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { AnimationPathPolicy } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

function previewPathShape(
  motion: MotionData,
  policy: AnimationPathPolicy
): "arc" | "linear" | "concave" {
  if (motion.motionType === "dash") return "linear";
  if (motion.motionType === "static") return "arc";
  if (policy.motionAwarePaths && motion.motionType === "pro") return "arc";
  if (policy.motionAwarePaths && motion.motionType === "anti") return "concave";
  return policy.pathShape;
}

export function savedSequencePathPolicy(
  sequence: SequenceData | null,
  fallback: AnimationPathPolicy
): AnimationPathPolicy {
  const shape = sequence?.metadata?.pathShape;
  const motionAware = sequence?.metadata?.motionAwarePaths;
  if (shape !== "arc" && shape !== "linear" && shape !== "concave") {
    return motionAware === true
      ? { pathShape: "arc", motionAwarePaths: true }
      : fallback;
  }
  return { pathShape: shape, motionAwarePaths: motionAware === true };
}

export function countPathOverrides(sequence: SequenceData | null): number {
  const hasSavedPolicy = sequence?.metadata?.pathShape !== undefined;
  const policy = savedSequencePathPolicy(sequence, {
    pathShape: "arc",
    motionAwarePaths: false,
  });
  const isException = (motion: MotionData | undefined) =>
    motion?.isVisible !== false &&
    motion?.pathShape !== undefined &&
    (!hasSavedPolicy || motion.pathShape !== previewPathShape(motion, policy));
  return (
    sequence?.steps?.filter(
      (step) =>
        isException(step.motions?.left) || isException(step.motions?.right)
    ).length ?? 0
  );
}

/** A preview becomes ordinary motion data so animation, cards and exports agree. */
export function applySequencePathPreview(
  sequence: SequenceData | null,
  policy: AnimationPathPolicy | null
): SequenceData | null {
  if (!sequence || !policy) return sequence;
  return {
    ...sequence,
    metadata: { ...sequence.metadata, ...policy },
    steps: (sequence.steps ?? []).map((step) => ({
      ...step,
      motions: Object.fromEntries(
        Object.entries(step.motions ?? {}).map(([hand, motion]) => {
          if (!motion || motion.isVisible === false) return [hand, motion];
          const pathShape = previewPathShape(motion, policy);
          return [hand, { ...motion, pathShape }];
        })
      ) as typeof step.motions,
    })),
  };
}
