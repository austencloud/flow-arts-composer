import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import type {
  MandalaPathShape,
  MandalaRenderOptions,
} from "#lib/shared/mandala/domain/mandala-types.js";
import type { CollectedMandala } from "./mandala-collection-types";

export interface SaveMandalaInput {
  steps: readonly StepData[];
  variant: MandalaRenderOptions["show"];
  leftPropType: string;
  rightPropType: string;
  pathShape: MandalaPathShape;
  sequenceWord: string;
}

export function buildMandalaCollectionEntry(
  input: SaveMandalaInput,
  existingCount: number
): Omit<CollectedMandala, "id" | "createdAt"> {
  const sourceWord = simplifyRepeatedWord(input.sequenceWord);
  const name = sourceWord || `Mandala #${existingCount + 1}`;

  return {
    name,
    steps: [...input.steps],
    variant: input.variant,
    leftPropType: input.leftPropType,
    rightPropType: input.rightPropType,
    pathShape: input.pathShape,
    source: "sequence",
    ...(sourceWord ? { sourceWord } : {}),
  };
}
