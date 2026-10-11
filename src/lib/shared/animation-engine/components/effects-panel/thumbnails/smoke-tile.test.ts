import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { SMOKE_PRESET_GROUP } from "../presets/smoke-presets";
import { paintSmokeTile, type SmokeIntent } from "./smoke-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("smoke tile", () => {
  it("paints every Smoke preset deterministically", () => {
    const intents: SmokeIntent[] = SMOKE_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.smoke,
      ...((p.patch ?? {}) as Partial<SmokeIntent>),
    }));
    paintsDeterministically(paintSmokeTile, intents);
  });
});
