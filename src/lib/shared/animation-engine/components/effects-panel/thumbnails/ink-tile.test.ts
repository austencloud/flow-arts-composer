import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { INK_PRESET_GROUP } from "../presets/ink-presets";
import { paintInkTile, type InkIntent } from "./ink-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("ink tile", () => {
  it("paints every Ink preset deterministically", () => {
    const intents: InkIntent[] = INK_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.ink,
      ...((p.patch ?? {}) as Partial<InkIntent>),
    }));
    paintsDeterministically(paintInkTile, intents);
  });
});
