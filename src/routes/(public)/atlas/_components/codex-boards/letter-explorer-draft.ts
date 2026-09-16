import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { pictographDataToStepData } from "$lib/shared/pictograph/shared/domain/utils/step-pictograph-conversion";
import { startPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
import { generateShareURL } from "$lib/shared/navigation/services/sequence-encoder";

export function buildLetterDraftSequence(
  pictograph: PictographData
): SequenceData {
  const letter = pictograph.letter ?? "";
  const stepSource: PictographData & { stepNumber: number } = {
    ...pictograph,
    stepNumber: 1,
  };
  const step = pictographDataToStepData(
    stepSource,
    `letter-explorer-${pictograph.id}`
  );
  const startPlacement = startPlacementDeriver.deriveFromFirstStep(step);
  const gridMode = step.motions.left.gridMode;

  return createSequenceData({
    id: `letter-explorer-${pictograph.id}`,
    name: `${letter} draft`,
    word: letter,
    steps: [step],
    startPlacement,
    startingPlacement: startPlacement,
    gridMode,
    sequenceLength: 1,
    tags: ["letter-explorer-draft"],
    metadata: { source: "letter-explorer" },
  });
}

/** The existing self-contained Composer deep link, normalized to a relative href. */
export function buildComposerDraftHref(sequence: SequenceData): string {
  const generated = generateShareURL(sequence, "construct").url;
  const parsed = new URL(generated, "https://tkaflowarts.com");
  // The encoder owns the payload, but its historical root pathname belongs to
  // app-shell callers. Public glossary pages must enter through the actual
  // Construct route so MainInterface initializes and consumes `?open=`.
  return `/create/construct${parsed.search}`;
}
