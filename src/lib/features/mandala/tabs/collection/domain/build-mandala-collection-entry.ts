import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import type {
  MandalaPathShape,
  MandalaRenderOptions,
} from "#lib/shared/mandala/domain/mandala-types.js";
import type { HandColorPair } from "@tka/render-composition";
import {
  SavedHandColorsSchema,
  type CollectedMandala,
} from "./mandala-collection-types";

export interface SaveMandalaInput {
  steps: readonly StepData[];
  variant: MandalaRenderOptions["show"];
  leftPropType: string;
  rightPropType: string;
  pathShape: MandalaPathShape;
  sequenceWord: string;
  /** The colors on screen as the maker saves. Null when nothing was chosen. */
  colors?: HandColorPair | null;
}

export function buildMandalaCollectionEntry(
  input: SaveMandalaInput,
  existingCount: number
): Omit<CollectedMandala, "id" | "createdAt"> {
  const sourceWord = simplifyRepeatedWord(input.sequenceWord);
  const name = sourceWord || `Mandala #${existingCount + 1}`;
  // Parsing also leaves a plain copy: this can be a reactive settings object,
  // which Firestore and the content digest should not see. A color the schema
  // would drop on load is dropped here too, or the stored revision's digest
  // would stop matching the entry that comes back.
  const colors = SavedHandColorsSchema.safeParse(input.colors);

  return {
    name,
    steps: [...input.steps],
    variant: input.variant,
    leftPropType: input.leftPropType,
    rightPropType: input.rightPropType,
    pathShape: input.pathShape,
    ...(colors.success ? { colors: colors.data } : {}),
    source: "sequence",
    ...(sourceWord ? { sourceWord } : {}),
  };
}
