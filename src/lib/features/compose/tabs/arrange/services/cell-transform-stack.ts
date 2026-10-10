/**
 * CellTransformStack - Non-destructive transform replay
 *
 * Replays an ordered stack of transforms against the original sequence
 * to produce the effective (displayed) result. The original is never mutated.
 *
 * Failed transforms are silently skipped so the user always sees
 * the best available result rather than losing all transforms.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { AppliedTransform } from "#lib/shared/animation-engine/domain/compose-types.js";
import { applyTransform } from "./arrange-layer-transformer";

export async function computeEffective(
  original: SequenceData,
  stack: AppliedTransform[]
): Promise<SequenceData> {
  if (stack.length === 0) return original;

  let current = original;
  for (const transform of stack) {
    const result = await applyTransform(current, transform.type);
    if (result.success && result.transformed) {
      current = result.transformed;
    }
  }
  return current;
}

export function push(
  stack: AppliedTransform[],
  type: AppliedTransform["type"],
  hand: AppliedTransform["hand"]
): AppliedTransform[] {
  return [...stack, { type, hand, timestamp: Date.now() }];
}

export function pop(stack: AppliedTransform[]): AppliedTransform[] {
  return stack.slice(0, -1);
}

export function clear(): AppliedTransform[] {
  return [];
}
