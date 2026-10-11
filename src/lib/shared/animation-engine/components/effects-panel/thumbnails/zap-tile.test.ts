import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { ZAP_PRESET_GROUP } from "../presets/zap-presets";
import { paintZapTile, type ZapIntent } from "./zap-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("zap tile", () => {
  it("paints every Zap preset deterministically", () => {
    const intents: ZapIntent[] = ZAP_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.zap,
      ...((p.patch ?? {}) as Partial<ZapIntent>),
    }));
    paintsDeterministically(paintZapTile, intents);
  });
});
