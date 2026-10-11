import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/** Both public demos draw from the same prepared 16-step LOOP recipe. */
export async function generateComposerDemoSequence(): Promise<SequenceData> {
  const [{ generationOrchestrator }, models, circular, grid, prop] =
    await Promise.all([
      import("#lib/shared/create/services/generation-orchestrator.js"),
      import("#lib/shared/foundation/domain/models/generation/generate-models.js"),
      import("#lib/shared/foundation/domain/models/generation/circular-models.js"),
      import("#lib/shared/pictograph/grid/domain/enums/grid-enums.js"),
      import("#lib/shared/pictograph/prop/domain/enums/prop-type.js"),
    ]);
  const sequence = await generationOrchestrator.generateSequence({
    mode: models.GenerationMode.CIRCULAR,
    loopType: circular.LOOPType.ROTATED,
    period: circular.Period.QUARTERED,
    length: 16,
    turnIntensity: 1.5,
    gridMode: grid.GridMode.DIAMOND,
    propType: prop.PropType.STAFF,
    difficulty: models.DifficultyLevel.INTERMEDIATE,
    constraintPreset: "smooth",
  });
  return JSON.parse(JSON.stringify(sequence)) as SequenceData;
}
