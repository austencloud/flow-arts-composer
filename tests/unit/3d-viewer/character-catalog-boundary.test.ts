import {
  CHARACTER_DEFINITIONS,
  getCharacterModelPath,
} from "#lib/shared/3d/domain/character-model.js";
import { DEPLOYED_CHARACTER_DEFINITIONS } from "#lib/shared/3d/config/deployed-characters.js";
import { characterThumbnailUrl } from "#lib/shared/3d/constants/r2-cdn.js";
import { describe, expect, it } from "vitest";

const PERSONAL_CHARACTER_ID = "personal-metaperson";

describe("character catalog license boundary", () => {
  it("makes the personal MetaPerson selectable during local development", () => {
    expect(
      CHARACTER_DEFINITIONS.some(
        (character) => character.id === PERSONAL_CHARACTER_ID
      )
    ).toBe(true);
    expect(getCharacterModelPath(PERSONAL_CHARACTER_ID)).toBe(
      "/models/avatars/bakeoff/personal-metaperson.glb"
    );
  });

  it("keeps evaluation characters out of deployment consumers", () => {
    expect(
      DEPLOYED_CHARACTER_DEFINITIONS.some(
        (character) => character.id === PERSONAL_CHARACTER_ID
      )
    ).toBe(false);
    expect(DEPLOYED_CHARACTER_DEFINITIONS).toHaveLength(16);
  });

  it("labels the local entry so deployment consumers can reject it", () => {
    const personalCharacter = CHARACTER_DEFINITIONS.find(
      (character) => character.id === PERSONAL_CHARACTER_ID
    );

    expect(personalCharacter).toMatchObject({
      name: "Austen",
      availability: "local-evaluation",
    });
    expect(characterThumbnailUrl(PERSONAL_CHARACTER_ID)).toBeNull();
  });
});
