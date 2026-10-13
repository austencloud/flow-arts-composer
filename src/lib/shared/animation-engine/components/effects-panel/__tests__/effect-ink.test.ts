import { describe, expect, it } from "vitest";
import { EFFECTS } from "../effect-registry";
import { EFFECT_INK_LIGHT_CONTRAST, effectInk } from "../effect-ink";
import { contrastRatio } from "#lib/shared/settings/utils/background-theme-calculator.js";

/** The light theme's hover, card and panel surfaces. */
const LIGHT_SURFACES = ["#c8c8c2", "#d8d8d2", "#d0d0ca"];

describe("effectInk", () => {
  it("keeps every effect color as it is in the dark theme", () => {
    for (const effect of EFFECTS) {
      expect(effectInk(effect.color, "dark")).toBe(effect.color);
    }
  });

  it("makes every effect readable on every light-theme surface", () => {
    for (const effect of EFFECTS) {
      const ink = effectInk(effect.color, "light");
      for (const surface of LIGHT_SURFACES) {
        expect(
          contrastRatio(ink, surface),
          `${effect.id} ${ink} on ${surface}`
        ).toBeGreaterThanOrEqual(EFFECT_INK_LIGHT_CONTRAST);
      }
    }
  });

  it("leaves a color that already reads on the light theme unchanged", () => {
    expect(effectInk("#1e3a8a", "light")).toBe("#1e3a8a");
  });

  it("darkens a pale color without turning it gray", () => {
    const ink = effectInk("#c8e0ff", "light");
    const r = parseInt(ink.slice(1, 3), 16);
    const g = parseInt(ink.slice(3, 5), 16);
    const b = parseInt(ink.slice(5, 7), 16);
    expect(b).toBeGreaterThan(r + 60);
    expect(b).toBeGreaterThan(g);
  });
});
