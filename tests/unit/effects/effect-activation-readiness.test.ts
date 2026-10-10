import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EFFECTS } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
import { EFFECT_ACTIVATION_READINESS } from "#lib/shared/3d/effects/scene-effects/effect-activation-readiness.js";

describe("instant 3D effect activation", () => {
  it("has an explicit pre-reveal strategy for every registered effect", () => {
    expect(Object.keys(EFFECT_ACTIVATION_READINESS)).toEqual(
      EFFECTS.map((effect) => effect.id)
    );
  });

  it("ships an exact eight-performer scripted activation harness", () => {
    const page = readFileSync(
      resolve("src/routes/test/effect-grid/+page.svelte"),
      "utf8"
    );
    const scene = readFileSync(
      resolve("src/routes/test/effect-grid/EffectGridScene.svelte"),
      "utf8"
    );
    expect(page).toContain("__effectActivationHarness");
    expect(page).toContain("performerCount: 8");
    expect(scene).toContain("formationCount");
    expect(scene).toContain("centerPlanes={props.centerPlanes}");
  });
});
