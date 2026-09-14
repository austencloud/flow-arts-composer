import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { resolveRealizationEntryStep } from "$lib/shared/shape-matrix/services/realization-phase-handoff";

interface MotionPathEntryInput {
  outgoing: SequenceData | null;
  outgoingStep: number;
  incoming: SequenceData;
  fallbackKey: string;
}

function motionSignature(motion: MotionData): string {
  return JSON.stringify([
    motion.motionType,
    motion.startLocation,
    motion.endLocation,
    motion.rotationDirection,
    motion.startOrientation ?? null,
    motion.endOrientation ?? null,
    motion.turns ?? null,
    motion.handPath ?? null,
    motion.skewSteps ?? null,
    motion.skewDir ?? null,
    motion.pathShape ?? null,
    motion.segment?.t0 ?? null,
    motion.segment?.t1 ?? null,
  ]);
}

function preservesWholeLoop(
  hand: "left" | "right",
  outgoing: SequenceData,
  outgoingIndex: number,
  incoming: SequenceData,
  incomingIndex: number
): boolean {
  if (outgoing.steps.length !== incoming.steps.length) return false;
  return outgoing.steps.every((_, offset) => {
    const outgoingStep =
      outgoing.steps[(outgoingIndex + offset) % outgoing.steps.length];
    const incomingStep =
      incoming.steps[(incomingIndex + offset) % incoming.steps.length];
    return (
      outgoingStep &&
      incomingStep &&
      outgoingStep.duration === incomingStep.duration &&
      motionSignature(outgoingStep.motions[hand]) ===
        motionSignature(incomingStep.motions[hand])
    );
  });
}

function cyclicIndex(step: number, count: number): number {
  return ((Math.floor(step - 1) % count) + count) % count;
}

/**
 * Finds the incoming beat that keeps a hand on the exact same authored curve.
 * Timing and direction choices often move only one hand around the loop. When
 * that happens, matching its complete motion signature lets it keep moving
 * through the fade rather than making both hands restart at a generic phase.
 */
export function resolveMotionPathEntryStep({
  outgoing,
  outgoingStep,
  incoming,
  fallbackKey,
}: MotionPathEntryInput): number {
  const incomingCount = incoming.steps.length;
  const fallback = resolveRealizationEntryStep({
    outgoingStep,
    outgoingStepCount: outgoing?.steps.length ?? 0,
    incomingStepCount: incomingCount,
    fallbackKey,
  });
  if (!outgoing || outgoing.steps.length === 0 || incomingCount === 0)
    return fallback;

  const outgoingIndex = cyclicIndex(outgoingStep, outgoing.steps.length);
  const fraction = outgoingStep - Math.floor(outgoingStep);
  const preferredIndex = cyclicIndex(fallback, incomingCount);
  let best: { index: number; score: number; distance: number } | null = null;

  incoming.steps.forEach((step, index) => {
    const score =
      Number(
        preservesWholeLoop("left", outgoing, outgoingIndex, incoming, index)
      ) +
      Number(
        preservesWholeLoop("right", outgoing, outgoingIndex, incoming, index)
      );
    if (score === 0) return;
    const rawDistance = Math.abs(index - preferredIndex);
    const distance = Math.min(rawDistance, incomingCount - rawDistance);
    if (
      !best ||
      score > best.score ||
      (score === best.score && distance < best.distance)
    ) {
      best = { index, score, distance };
    }
  });

  return best ? 1 + best.index + fraction : fallback;
}
