import { describe, expect, it } from "vitest";

import { CHARCOAL_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/charcoal-presets.js";

describe("Charcoal motion profiles", () => {
  it("keeps the review profiles physically distinct", () => {
    const byId = new Map(CHARCOAL_PRESETS.map((preset) => [preset.id, preset]));

    expect(byId.get("charcoal-steel-wool")?.patch).toMatchObject({
      intensity: 0.98,
      spread: 0.14,
      glow: 0.96,
      emissionStyle: "steel-wool",
    });
    // Spread tightened 0.42 → 0.30 in 21202c1904: at 0.42 Forge Burst sat
    // between Steel Wool and Cinder Fan without being either, measuring within
    // 10 RGB of both. See the rationale on the preset itself.
    expect(byId.get("charcoal-forge-cinder")?.patch).toMatchObject({
      intensity: 0.9,
      spread: 0.3,
      glow: 0.8,
      emissionStyle: "forge-burst",
    });
    expect(byId.get("charcoal-cinder-fan")?.patch).toMatchObject({
      intensity: 1,
      spread: 1,
      glow: 0.68,
      emissionStyle: "cinder-fan",
    });
    // A banked fire is damped down for the night, so this is the set's quiet
    // warm anchor: intensity 0.34, not 0.62. Six of the eight presets used to
    // sit at intensity >= 0.5, leaving the low end represented only by Ash.
    expect(byId.get("charcoal-banked-ember")?.patch).toMatchObject({
      intensity: 0.34,
      spread: 0.25,
      glow: 0.62,
      emissionStyle: "banked-ember",
    });

    const reviewStyles = [
      "charcoal-steel-wool",
      "charcoal-forge-cinder",
      "charcoal-cinder-fan",
      "charcoal-banked-ember",
    ].map((id) => byId.get(id)?.patch.emissionStyle);
    expect(new Set(reviewStyles)).toHaveLength(4);
  });
});
