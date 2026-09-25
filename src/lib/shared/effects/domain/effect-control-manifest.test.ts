import { describe, it, expect } from "vitest";
import {
  EFFECT_CONTROLS,
  controlsForView,
  primaryControls,
  type EffectView,
} from "./effect-control-manifest";
import { DEFAULT_EFFECTS_CONFIG } from "./defaults";
import { EFFECTS } from "$lib/shared/animation-engine/components/effects-panel/effect-registry";

describe("effect-control-manifest", () => {
  const crossStoreFields = new Set([
    "tailLength",
    "fireLeftHex",
    "fireRightHex",
  ]);

  // LED v2 is a device + strip pattern + nested look, none of which the
  // manifest's flat-field descriptors can address. Its controls live in
  // LedCustomize (device picker, pattern grid, look group), so it declares no
  // manifest controls by design.
  const withoutManifestControls = new Set(["led"]);
  const views: EffectView[] = ["2d", "3d"];

  it("every descriptor field exists on the effect's default intent", () => {
    for (const [effect, controls] of Object.entries(EFFECT_CONTROLS)) {
      const intent = (DEFAULT_EFFECTS_CONFIG as unknown as Record<string, Record<string, unknown>>)[effect];
      for (const c of controls) {
        if (crossStoreFields.has(c.field)) continue;
        expect(intent, `${effect}.${c.field}`).toHaveProperty(c.field);
        if (c.pairFields) {
          for (const f of c.pairFields) {
            if (!crossStoreFields.has(f)) {
              expect(intent, `${effect}.${f}`).toHaveProperty(f);
            }
          }
        }
      }
    }
  });

  it("every effect has a uniform Primary row (3-6 controls) in each view", () => {
    for (const effect of Object.keys(EFFECT_CONTROLS) as (keyof typeof EFFECT_CONTROLS)[]) {
      const intent = (DEFAULT_EFFECTS_CONFIG as unknown as Record<
        string,
        Record<string, unknown>
      >)[effect]!;
      if (withoutManifestControls.has(effect)) continue;
      for (const view of views) {
        const n = controlsForView(effect, view).filter(
          (c) => c.tier === "primary" && (!c.showWhen || c.showWhen(intent))
        ).length;
        expect(n, `${effect} (${view})`).toBeGreaterThanOrEqual(3);
        expect(n, `${effect} (${view})`).toBeLessThanOrEqual(6);
      }
    }
  });

  it("every canonical effect exposes a shared primary row in each view", () => {
    for (const effect of EFFECTS) {
      if (withoutManifestControls.has(effect.id)) continue;
      for (const view of views) {
        expect(
          primaryControls(effect.id as keyof typeof EFFECT_CONTROLS, view).length,
          `${effect.id} (${view})`
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  // The 2D and 3D goo renderers read different fields (see GooIntent). A
  // slider for a field its view ignores still moves and shows a value, so
  // nobody notices it does nothing; the 2D panels once shipped a dead Ambient
  // slider and no Viscosity that way.
  it("goo shows Viscosity only in 2D and Ambient only in 3D", () => {
    const fields = (view: EffectView) =>
      primaryControls("goo", view).map((c) => c.field);
    expect(fields("2d")).toContain("surfaceTension");
    expect(fields("2d")).not.toContain("ambientEmission");
    expect(fields("3d")).toContain("ambientEmission");
    expect(fields("3d")).not.toContain("surfaceTension");
  });

  it("control ids are unique within each effect", () => {
    for (const [effect, controls] of Object.entries(EFFECT_CONTROLS)) {
      const ids = controls.map((c) => c.id);
      expect(new Set(ids).size, effect).toBe(ids.length);
    }
  });
});
