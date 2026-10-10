/**
 * Short loopable demo sequences for the prop-unlock tunnel reveal. The first
 * reveal uses a cached loop (fast); "remix" generates a fresh random one. The
 * prop rendered on top is swapped per reveal — the motion is the variable.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { generationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { isSeamlesslyLoopable } from "#lib/features/compose/services/sequence-loopability-checker.js";

/** Generate one demo loop. The generation prop is irrelevant — the render prop
 *  is set on the canvas; only the motion matters here. */
function generateDemoLoop(): Promise<SequenceData> {
  return generationOrchestrator
    .generateSequence({
      length: 8,
      gridMode: GridMode.DIAMOND,
      propType: PropType.STAFF,
      difficulty: DifficultyLevel.INTERMEDIATE,
      constraintPreset: "smooth",
    })
    .then((seq) => {
      try {
        if (!isSeamlesslyLoopable(seq)) {
          console.warn("[prop-demo-loop] demo sequence is not seamlessly loopable; tunnel may blip at wrap.");
        }
      } catch (e) {
        console.warn("[prop-demo-loop] loopability check failed:", e);
      }
      return seq;
    });
}

let cached: Promise<SequenceData> | null = null;

/** Cached loop for the first reveal (fast, reused). */
export function getPropDemoLoop(): Promise<SequenceData> {
  return (cached ??= generateDemoLoop());
}

/** A fresh random loop each call — used by the "remix" interaction. */
export function generateFreshDemoLoop(): Promise<SequenceData> {
  return generateDemoLoop();
}
