import { describe, expect, it } from "vitest";

import { normalizeLegacyAppSettings } from "#lib/shared/settings/domain/app-settings.js";
import { normalizeCompositionRecipe } from "#lib/shared/pictograph/prop/domain/composition-recipe-normalize.js";

// The shape a real account still had in Firestore on 2026-11-12: Prop Button
// Lab overrides saved before hands were named by side. Opening the prop
// picker with these blanked the sheet and then crashed the app.
const LEGACY_OVERRIDES = {
  staff: {
    blue: { rotation: -45, scale: 0.55, x: 50, y: 50 },
    red: { rotation: -135, scale: 0.55, x: 50, y: 50 },
    pairScale: 1,
  },
  fan: {
    blue: { rotation: 0, scale: 0.45, x: 35, y: 50 },
    red: { rotation: 180, scale: 0.45, x: 65, y: 50 },
    pairScale: 1,
  },
};

describe("normalizeLegacyAppSettings composition recipe overrides", () => {
  it("turns blue/red overrides into left/right", () => {
    const normalized = normalizeLegacyAppSettings({
      compositionRecipeOverrides: LEGACY_OVERRIDES,
    });

    expect(normalized.compositionRecipeOverrides).toEqual({
      staff: {
        left: { x: 50, y: 50, rotation: -45, scale: 0.55 },
        right: { x: 50, y: 50, rotation: -135, scale: 0.55 },
        pairScale: 1,
      },
      fan: {
        left: { x: 35, y: 50, rotation: 0, scale: 0.45 },
        right: { x: 65, y: 50, rotation: 180, scale: 0.45 },
        pairScale: 1,
      },
    });
  });

  it("keeps a current left/right override as it is", () => {
    const current = {
      left: { x: 40, y: 50, rotation: 10, scale: 0.5 },
      right: { x: 60, y: 50, rotation: -10, scale: 0.5 },
      pairScale: 0.9,
    };
    const normalized = normalizeLegacyAppSettings({
      compositionRecipeOverrides: { club: current },
    });
    expect(normalized.compositionRecipeOverrides).toEqual({ club: current });
  });

  it("drops an entry it cannot read instead of passing it on", () => {
    const normalized = normalizeLegacyAppSettings({
      compositionRecipeOverrides: {
        staff: LEGACY_OVERRIDES.staff,
        broken: { blue: { x: 1 } },
        junk: "nope",
      },
    });
    expect(Object.keys(normalized.compositionRecipeOverrides ?? {})).toEqual([
      "staff",
    ]);
  });

  it("leaves settings without overrides alone", () => {
    const normalized = normalizeLegacyAppSettings({ darkMode: true });
    expect("compositionRecipeOverrides" in normalized).toBe(false);
  });
});

describe("normalizeCompositionRecipe", () => {
  it("returns null for anything the preview cannot draw", () => {
    expect(normalizeCompositionRecipe(undefined)).toBeNull();
    expect(normalizeCompositionRecipe({ pairScale: 1 })).toBeNull();
    expect(
      normalizeCompositionRecipe({
        left: { x: 1, y: 2, rotation: 0, scale: Number.NaN },
        right: { x: 1, y: 2, rotation: 0, scale: 1 },
      })
    ).toBeNull();
  });

  it("defaults a missing pair scale to 1", () => {
    expect(
      normalizeCompositionRecipe({
        left: { x: 1, y: 2, rotation: 0, scale: 1 },
        right: { x: 3, y: 4, rotation: 0, scale: 1 },
      })?.pairScale
    ).toBe(1);
  });
});
