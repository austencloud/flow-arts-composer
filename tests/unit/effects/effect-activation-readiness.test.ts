import { describe, expect, it } from "vitest";
import { EFFECTS } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
import { EFFECT_ACTIVATION_READINESS } from "#lib/shared/3d/effects/scene-effects/effect-activation-readiness.js";

describe("instant 3D effect activation", () => {
  it("has an explicit pre-reveal strategy for every registered effect", () => {
    expect(Object.keys(EFFECT_ACTIVATION_READINESS)).toEqual(
      EFFECTS.map((effect) => effect.id)
    );
  });
});
