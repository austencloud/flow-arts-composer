import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { ANIMAL_PRESET_GROUP } from "../presets/animal-presets";
import { paintAnimalTile, type AnimalIntent } from "./animal-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("animal tile", () => {
  it("paints every Animal preset deterministically", () => {
    const intents: AnimalIntent[] = ANIMAL_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.animal,
      ...((p.patch ?? {}) as Partial<AnimalIntent>),
    }));
    paintsDeterministically(paintAnimalTile, intents);
  });
});
