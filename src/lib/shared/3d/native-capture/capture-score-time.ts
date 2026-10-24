import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { normalizeLegacySequence } from "@tka/tka-types";
import { separateStepsFromStartPlacement } from "#lib/shared/animation-engine/services/sequence-normalizer.js";
import { runtimeMotionSampleTime } from "../../../../../unreal/Shared/Tools/runtime-motion-bundle.mjs";

/** Keep legacy start placements out of the timed score and the captured source. */
export function normalizeCaptureSequence(sequence: SequenceData): SequenceData {
  const normalized = normalizeLegacySequence(sequence);
  if (!Array.isArray(normalized?.steps)) return normalized;
  const embeddedStart = normalized.steps.find((step) => step.stepNumber === 0);
  if (!embeddedStart) return normalized;

  // Extract through the existing converter, retaining playback's precedence:
  // explicit placement, embedded start row, then legacy startingPlacement.
  const separated = separateStepsFromStartPlacement({
    ...normalized,
    startPlacement: undefined,
    startingPlacement: undefined,
  });
  return {
    ...normalized,
    steps: separated.steps,
    startPlacement: normalized.startPlacement ?? {
      ...separated.startPlacement!,
      ...(embeddedStart.gridMode !== undefined && {
        gridMode: embeddedStart.gridMode,
      }),
    },
  };
}

/** Convert elapsed production seconds to the score position understood by the performer. */
export function scoreAtCaptureTime(
  steps: SequenceData["steps"],
  seconds: number
): number {
  if (!steps.length || !Number.isFinite(seconds) || seconds < 0)
    throw new Error("Invalid capture time or empty sequence");
  let elapsed = seconds;
  for (let index = 0; index < steps.length; index += 1) {
    const duration = steps[index]!.duration;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("Authored sequence has an invalid step duration");
    if (elapsed < duration) return index + elapsed / duration;
    elapsed -= duration;
  }
  if (elapsed < 1e-7) return steps.length;
  throw new Error("Capture time exceeds authored sequence duration");
}

/** Feed a looping capture its previous authored cycle before recording frame zero. */
export function captureWarmupTimes(
  loop: boolean,
  durationSeconds: number,
  frameCount: number
): number[] {
  if (!loop) return [];
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
      !Number.isSafeInteger(frameCount) || frameCount <= 0)
    throw new Error("Invalid capture timing");
  return Array.from({ length: frameCount }, (_, frame) =>
    runtimeMotionSampleTime(frame, durationSeconds, frameCount));
}
