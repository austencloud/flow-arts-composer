import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { GOO_PRESET_GROUP } from "../presets/goo-presets";
import { paintGooTile, type GooIntent } from "./goo-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("goo tile", () => {
  it("paints every Goo preset deterministically", () => {
    const intents: GooIntent[] = GOO_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.goo,
      ...((p.patch ?? {}) as Partial<GooIntent>),
    }));
    paintsDeterministically(paintGooTile, intents);
  });
});
