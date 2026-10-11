import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { SPARKLES_PRESET_GROUP } from "../presets/sparkles-presets";
import { paintSparkleTile, type SparkleIntent } from "./sparkle-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("sparkle tile", () => {
  it("paints every Sparkle preset deterministically", () => {
    const intents: SparkleIntent[] = SPARKLES_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.sparkles,
      ...(p.patch ?? {}),
    }));
    paintsDeterministically(paintSparkleTile, intents);
  });
});
