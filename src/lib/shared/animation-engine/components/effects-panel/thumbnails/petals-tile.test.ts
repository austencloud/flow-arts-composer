import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { PETALS_PRESET_GROUP } from "../presets/petals-presets";
import { paintPetalsTile, type PetalsIntent } from "./petals-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("petals tile", () => {
  it("paints every Petals preset deterministically", () => {
    const intents: PetalsIntent[] = PETALS_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.petals,
      ...((p.patch ?? {}) as Partial<PetalsIntent>),
    }));
    paintsDeterministically(paintPetalsTile, intents);
  });
});
