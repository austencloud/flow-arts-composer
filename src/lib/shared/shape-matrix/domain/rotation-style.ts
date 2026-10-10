import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export type RotationStyle = "iso" | "antispin" | "hybrid";

/** Effective prop spin of one hand: float resolves to its prefloat pro/anti. */
function spin(
  motion: { motionType?: string; prefloatMotionType?: string } | undefined
): "pro" | "anti" | null {
  if (!motion) return null;
  const type =
    motion.motionType === MotionType.FLOAT
      ? motion.prefloatMotionType
      : motion.motionType;
  if (type === MotionType.PRO) return "pro";
  if (type === MotionType.ANTI) return "anti";
  return null;
}

/** Bucket a sequence by the prop rotation style that drives its mandala. */
export function classifyRotationStyle(sequence: SequenceData): RotationStyle {
  for (const step of sequence.steps) {
    if ((step as { isBlank?: boolean }).isBlank) continue;
    const motions = step.motions as unknown as Partial<
      Record<string, { motionType?: string; prefloatMotionType?: string }>
    >;
    const left = spin(motions[HandSide.LEFT]);
    const right = spin(motions[HandSide.RIGHT]);
    if (!left || !right) continue;
    if (left === "pro" && right === "pro") return "iso";
    if (left === "anti" && right === "anti") return "antispin";
    return "hybrid";
  }
  return "hybrid";
}
