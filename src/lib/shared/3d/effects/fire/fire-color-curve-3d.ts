/**
 * FireColorCurve3D - Color ramp presets for volumetric fire shader.
 *
 * Each preset defines four color stops that the raymarching shader interpolates
 * through based on local fire density/temperature:
 *   hot  → core of flame (brightest, highest density)
 *   warm → mid-flame body
 *   cool → outer edge / dying flame
 *   smoke → nearly-extinguished wisps
 *
 * Colors are normalized to [0,1] for direct use as GLSL vec3 uniforms.
 */

import { Color } from "three";
import type { FireColorCurve } from "#lib/shared/animation-engine/domain/types/fire-types.js";

export type FireColorPreset = "classic" | "blue" | "spirit" | "custom";

export interface FireColorSet {
  hot: Color;
  warm: Color;
  cool: Color;
  smoke: Color;
}

const hex = (r: number, g: number, b: number) => new Color(r / 255, g / 255, b / 255);

const PRESETS: Record<Exclude<FireColorPreset, "custom">, FireColorSet> = {
  classic: {
    // Orange woodfire ramp. The hot core keeps G and B well below R (orange,
    // not cream) so even where dense additive overlap clips the red channel
    // the hue holds at orange instead of washing out to a white-yellow blob.
    // A near-white core only appears at the very brightest overlap, rimmed
    // orange — reads as fire, not a floodlight.
    hot:   hex(255, 110, 20),   // #FF6E14 - rich orange core
    warm:  hex(232, 64, 8),     // #E84008 - deep orange body
    cool:  hex(168, 20, 4),     // #A81404 - red outer
    smoke: hex(40, 35, 30),     // #28231E - dark smoke
  },
  blue: {
    hot:   hex(220, 240, 255),  // #DCF0FF - icy white core
    warm:  hex(80, 160, 255),   // #50A0FF - vivid blue
    cool:  hex(30, 50, 180),    // #1E32B4 - deep indigo
    smoke: hex(30, 30, 45),     // #1E1E2D - midnight
  },
  spirit: {
    hot:   hex(220, 255, 230),  // #DCFFE6 - pale green core
    warm:  hex(40, 220, 120),   // #28DC78 - vivid green
    cool:  hex(10, 100, 80),    // #0A6450 - forest
    smoke: hex(25, 35, 30),     // #19231E - dark green-grey
  },
};

export function getFireColors(preset: FireColorPreset, customColors?: Partial<FireColorSet>): FireColorSet {
  if (preset === "custom" && customColors) {
    return {
      hot:   customColors.hot   ?? PRESETS.classic.hot,
      warm:  customColors.warm  ?? PRESETS.classic.warm,
      cool:  customColors.cool  ?? PRESETS.classic.cool,
      smoke: customColors.smoke ?? PRESETS.classic.smoke,
    };
  }

  const key = preset === "custom" ? "classic" : preset;
  return { ...PRESETS[key] };
}

const mixRgb = (
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number
) => new Color(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);

/**
 * The 3D particle ramp for a Fire look's color curve, the same curve the 2D
 * fluid fire draws with, so Blue Flame and Spirit burn the same color in both
 * views. The particle core stops short of the curve's near-white core: dense
 * additive overlap supplies that brightest white where the flame is thickest.
 */
export function fireColorsFromCurve(curve: FireColorCurve): FireColorSet {
  return {
    hot: mixRgb(curve.hotColor, curve.coreColor, 0.25),
    warm: mixRgb(curve.midColor, curve.hotColor, 0.35),
    cool: mixRgb(curve.coldColor, curve.midColor, 0.75),
    smoke: mixRgb([0, 0, 0], curve.coldColor, 0.5),
  };
}
