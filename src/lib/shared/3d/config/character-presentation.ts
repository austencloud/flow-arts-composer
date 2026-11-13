import {
  CHARACTER_DEFINITIONS,
  type CharacterId,
} from "../domain/character-model";
import { DEPLOYED_CHARACTER_IDS } from "./deployed-characters";

/**
 * How a character reads on stage, as labelled by the product owner from the
 * rendered models on 2026-09-04. The Mixamo catalog ships no gender metadata,
 * so this is a visual judgement about presentation, not an identity claim.
 * "androgynous" covers helmets, hoods, and faces that read either way.
 */
export type CharacterPresentation = "masculine" | "feminine" | "androgynous";

export const CHARACTER_PRESENTATION: Readonly<
  Record<CharacterId, CharacterPresentation>
> = {
  "x-bot": "masculine",
  "y-bot": "feminine",
  remy: "masculine",
  ch26: "feminine",
  ch01: "masculine",
  ch07: "feminine",
  ch10: "masculine",
  ch12: "feminine",
  ch18: "androgynous",
  ch21: "androgynous",
  ch22: "feminine",
  ch24: "masculine",
  ch34: "feminine",
  ch41: "androgynous",
  ch42: "masculine",
  ch44: "androgynous",
  "personal-metaperson": "masculine",
  // The default cast's local bodies (default-cast-characters.ts).
  "renderpeople-sophia": "feminine",
  "renderpeople-manuel": "masculine",
  "rocketbox-male-adult-08": "masculine",
};

export function charactersWithPresentation(
  presentation: CharacterPresentation
): CharacterId[] {
  return DEPLOYED_CHARACTER_IDS.filter(
    (id) => CHARACTER_PRESENTATION[id] === presentation
  );
}

export function countCharacterPresentations(): Record<
  CharacterPresentation,
  number
> {
  const counts: Record<CharacterPresentation, number> = {
    masculine: 0,
    feminine: 0,
    androgynous: 0,
  };
  for (const id of DEPLOYED_CHARACTER_IDS) {
    const presentation = CHARACTER_PRESENTATION[id];
    if (!presentation) continue;
    counts[presentation]++;
  }
  return counts;
}

// Compile-time guard: a new catalog entry without a label fails the build.
CHARACTER_DEFINITIONS satisfies readonly { id: CharacterId }[];
