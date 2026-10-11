import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { SILK_PRESET_GROUP } from "../presets/silk-presets";
import { paintSilkTile, type SilkIntent } from "./silk-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("silk tile", () => {
  it("paints every Silk preset deterministically", () => {
    const intents: SilkIntent[] = SILK_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.silk,
      ...((p.patch ?? {}) as Partial<SilkIntent>),
    }));
    paintsDeterministically(
      (ctx, intent) => paintSilkTile(ctx, intent, "#2e3192"),
      intents
    );
  });
});
