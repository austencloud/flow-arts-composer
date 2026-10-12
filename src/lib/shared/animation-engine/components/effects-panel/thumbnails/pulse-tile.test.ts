import { describe, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { PULSE_PRESET_GROUP } from "../presets/pulse-presets";
import { paintPulseTile, type PulseIntent } from "./pulse-tile";
import { paintsDeterministically } from "./tile-test-utils";

describe("pulse tile", () => {
  it("paints every Pulse preset deterministically", () => {
    const intents: PulseIntent[] = PULSE_PRESET_GROUP.presets.map((p) => ({
      ...DEFAULT_EFFECTS_CONFIG.pulse,
      ...((p.patch ?? {}) as Partial<PulseIntent>),
    }));
    paintsDeterministically(paintPulseTile, intents);
  });
});
