/**
 * Which words the LOOP tab uses for a kind of LOOP: its name, and the sentence
 * it says once the steps can close and once the LOOP is made.
 */
import { Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import type { LoopFamily, LoopVariant } from "./loop-families";

type Shape = "quarter" | "half" | Exclude<LoopFamily, "rotated">;

function shapeOf(family: LoopFamily, variant: LoopVariant): Shape {
  if (family !== "rotated") return family;
  return variant.period === Period.QUARTERED ? "quarter" : "half";
}

export function familyNameKey(family: LoopFamily) {
  return `create_loop_kind_${family}` as const;
}

/** The name with "LOOP" in it, where there is room to say it whole. */
export function familyFullKey(family: LoopFamily) {
  return `create_loop_full_${family}` as const;
}

export function familyPlainKey(family: LoopFamily) {
  return `create_loop_plain_${family}` as const;
}

export function readyKey(family: LoopFamily, variant: LoopVariant) {
  return `create_loop_ready_${shapeOf(family, variant)}` as const;
}

export function resultKey(family: LoopFamily, variant: LoopVariant) {
  return `create_loop_result_${shapeOf(family, variant)}` as const;
}
