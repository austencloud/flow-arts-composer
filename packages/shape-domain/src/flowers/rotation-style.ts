import { HandSide, MotionType } from "@tka/tka-types";

/** The part of the Composer's SequenceData the classifier reads. */
interface RotationStyleSequence {
  readonly steps: readonly { readonly motions: unknown }[];
}

export type RotationStyle = "iso" | "antispin" | "hybrid";

/** Effective prop spin of one hand: float resolves to its prefloat pro/anti. */
function spin(
  motion: { motionType?: string; prefloatMotionType?: string } | undefined
): "pro" | "anti" | null {
  if (!motion) return null;
  const type =
    motion.motionType === MotionType.float
      ? motion.prefloatMotionType
      : motion.motionType;
  if (type === MotionType.pro) return "pro";
  if (type === MotionType.anti) return "anti";
  return null;
}

/** Bucket a sequence by the prop rotation style that drives its mandala. */
export function classifyRotationStyle(sequence: RotationStyleSequence): RotationStyle {
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
