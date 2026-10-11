import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { FlowerStyle } from "../domain/flower-signature";

/**
 * The structural minimum this resolver reads off a rotation-style matrix: the
 * style tag it selects on, and the per-turn-pattern representatives it pulls
 * the 0-turn seed from.
 *
 * Declared here rather than importing lab's `RotationStyleMatrix` so this
 * module keeps the boundary documented in `../README.md` ("Known lab-side
 * dependencies" allowlists two value imports and nothing else). TypeScript is
 * structural, so lab's richer type satisfies this at every call site — and
 * this module states what it actually consumes instead of borrowing a type it
 * does not own.
 */
export interface FlowerArchetypeMatrix {
  style: string;
  byTurn: Map<string, SequenceData>;
}

/**
 * The zero-turn two-hand archetype seed a flower is built from: pro spin →
 * isolation, anti spin → antispin. `buildFlowerSequence` applies the flower's
 * turns + orientation to this seed, so both hands must be present here. Pulled
 * out of `shape-matrix-flowers.ts` so the shape matrix and the Fuse VTG picker
 * resolve archetypes the same way.
 */
export function resolveFlowerArchetype(
  matrices: FlowerArchetypeMatrix[],
  style: FlowerStyle
): SequenceData {
  const id = style === "pro" ? "iso" : "antispin";
  const matrix = matrices.find((m) => m.style === id);
  if (!matrix) throw new Error(`no ${id} archetype matrix`);
  const base = matrix.byTurn.get("0|0");
  if (!base) throw new Error(`no 0-turn rep for ${id}`);
  return base;
}
