import { describe, expect, it } from "vitest";
import { ledCapturePattern } from "../../../src/routes/test/prop-3d-studio/capture/led-capture-pattern.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import type { LedPatternSource } from "#lib/shared/animation-engine/domain/types/led-types.js";

describe("LED capture pattern", () => {
  it("keeps the default generator's authored parameters when selecting a capture pattern", () => {
    const defaults: LedPatternSource = {
      source: "generator",
      generatorId: "prop-colors",
      params: {
        primaryColor: { r: 12, g: 34, b: 56 },
        speed: 2,
        brightness: 0.75,
      },
    };
    const pattern = ledCapturePattern(defaults, "rainbow-sweep");
    expect(pattern.generatorId).toBe("rainbow-sweep");
    expect(pattern.params).toEqual(defaults.params);
  });

  it("uses canonical generator parameters if the default source is an image", () => {
    const pattern = ledCapturePattern(
      { source: "image", libraryEntryId: "capture-reference" },
      "prop-colors"
    );
    const defaults = DEFAULT_EFFECTS_CONFIG.led.pattern;
    expect(defaults.source).toBe("generator");
    if (defaults.source !== "generator") {
      throw new Error(
        "Update the canonical generator reference for this test."
      );
    }
    expect(pattern.params).toEqual(defaults.params);
    expect(pattern.source).toBe("generator");
  });
});
