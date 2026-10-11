import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { BUBBLES_PRESET_GROUP } from "../presets/bubbles-presets";
import { paintBubblesTile, type BubblesIntent } from "./bubbles-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("bubbles tile", () => {
  it("paints every Bubbles preset deterministically", () => {
    const intents: BubblesIntent[] = BUBBLES_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.bubbles,
      ...((p.patch ?? {}) as Partial<BubblesIntent>),
    }));
    paintsDeterministically(paintBubblesTile, intents);
  });
});
