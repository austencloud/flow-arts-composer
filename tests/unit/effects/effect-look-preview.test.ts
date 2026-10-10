import { describe, expect, it } from "vitest";
import { EFFECT_CONTROLS } from "#lib/shared/effects/domain/effect-control-manifest.js";
import {
  EFFECTS,
  getRegistration,
} from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
import { createEffectLookPreview } from "#lib/shared/animation-engine/components/effects-panel/effect-look-preview.js";
// bloom-look-copy was folded into the shared look-copy module in 8dcbd1cb6f,
// where the per-effect describeBloomLook became one preset-keyed describeLook.
import { describeLook } from "#lib/shared/animation-engine/components/effects-panel/thumbnails/look-copy.js";

describe("effect look previews", () => {
  it("gives every named look a semantic visual model", () => {
    for (const effect of EFFECTS) {
      const registration = getRegistration(effect.id);
      expect(registration, effect.id).toBeDefined();

      for (const preset of registration!.presetGroup.presets) {
        const preview = createEffectLookPreview(effect.id, preset);

        expect(
          preview.colors.length,
          `${effect.id}.${preset.id} colors`
        ).toBeGreaterThan(0);
        expect(preview.trait, `${effect.id}.${preset.id} trait`).not.toBe(
          "Ready to apply"
        );
        expect(
          preview.signature,
          `${effect.id}.${preset.id} signature`
        ).toContain(preview.motif);
        expect(
          Number.isFinite(preview.energy),
          `${effect.id}.${preset.id} energy`
        ).toBe(true);
        expect(
          Number.isFinite(preview.extent),
          `${effect.id}.${preset.id} extent`
        ).toBe(true);
      }
    }
  });

  it("does not collapse a multi-look group into one repeated preview", () => {
    for (const effect of EFFECTS) {
      const presets = getRegistration(effect.id)!.presetGroup.presets;
      if (presets.length < 2) continue;

      const signatures = new Set(
        presets.map(
          (preset) => createEffectLookPreview(effect.id, preset).signature
        )
      );

      expect(signatures.size, effect.id).toBeGreaterThan(1);
    }
  });

  it("keeps fringe desktop controls out of the compact tuner", () => {
    const desktopOnly = [
      "bloom-streak",
      "bloom-spikes",
      "bloom-afterglow",
      "pulse-velocityScale",
      "pulse-asymmetry",
      "pulse-chromatic",
      "pulse-flash",
      "pulse-harmonics",
    ];
    const controls = [...EFFECT_CONTROLS.bloom, ...EFFECT_CONTROLS.pulse];

    for (const id of desktopOnly) {
      expect(
        controls.find((control) => control.id === id),
        id
      ).toMatchObject({
        tier: "advanced",
        compact: false,
      });
    }
  });

  it("describes Bloom looks by what people see, not renderer parameters", () => {
    const bloomPresets = getRegistration("bloom")!.presetGroup.presets;

    for (const preset of bloomPresets) {
      const description = describeLook(preset.id);
      expect(description, preset.id).not.toBeNull();
      expect(description, preset.id).not.toMatch(/px|%|\d/);
    }
  });
});
