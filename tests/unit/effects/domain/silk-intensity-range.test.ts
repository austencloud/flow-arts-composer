import { describe, expect, it } from "vitest";
import { SILK_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/silk-presets.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { EFFECT_CONTROLS } from "#lib/shared/effects/domain/effect-control-manifest.js";
import {
  clampSilkIntensity,
  SILK_INTENSITY_DEFAULT,
  SILK_INTENSITY_MAX,
} from "#lib/shared/effects/domain/effects-config.js";
import { migrateEffectsConfig } from "#lib/shared/effects/domain/migrations.js";

describe("Silk intensity range", () => {
  it("ships at 50% with 65% as the shared control maximum", () => {
    const intensityControl = EFFECT_CONTROLS.silk.find(
      (control) => control.field === "intensity"
    );

    expect(DEFAULT_EFFECTS_CONFIG.silk.intensity).toBe(SILK_INTENSITY_DEFAULT);
    expect(SILK_INTENSITY_DEFAULT).toBe(0.5);
    expect(SILK_INTENSITY_MAX).toBe(0.65);
    expect(intensityControl?.max).toBe(SILK_INTENSITY_MAX);
  });

  it("keeps every shipped Silk preset within the ceiling", () => {
    for (const preset of SILK_PRESETS) {
      expect(
        preset.patch?.intensity,
        `${preset.id} exceeds the Silk intensity ceiling`
      ).toBeLessThanOrEqual(SILK_INTENSITY_MAX);
    }
  });

  it("clamps out-of-range values and heals saved configurations", () => {
    expect(clampSilkIntensity(-0.2)).toBe(0);
    expect(clampSilkIntensity(0.9)).toBe(SILK_INTENSITY_MAX);

    const saved = structuredClone(DEFAULT_EFFECTS_CONFIG);
    saved.silk.intensity = 0.9;
    expect(migrateEffectsConfig(saved).silk.intensity).toBe(SILK_INTENSITY_MAX);
  });
});
