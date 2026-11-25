/**
 * The look of the site walk: what the light, the sky, the haze and the print of
 * the picture are at each hour.
 *
 * One recipe per light. A colour is an sRGB hex with a separate strength, so a
 * sun-side horizon can be brighter than white and still keep its colour. The
 * same recipe feeds the sky that is drawn, the sky that lights everything, the
 * haze in the distance and the final grade, so they cannot disagree.
 */

import { Color, Vector3 } from "three";

export type LookName = "dusk" | "night";

/** A colour, and how many times brighter than itself it burns. */
export type Radiance = readonly [hex: string, strength: number];

export interface LookRecipe {
  /** The light that casts the shadows: the sun, or the moon at night. */
  key: {
    azimuth: number;
    elevation: number;
    colour: string;
    intensity: number;
    softness: number;
  };
  sky: {
    zenith: Radiance;
    midSun: Radiance;
    midAnti: Radiance;
    horizonSun: Radiance;
    horizonAnti: Radiance;
    /** The pink band opposite a low sun. */
    belt: Radiance;
    glow: Radiance;
    /** The disk itself, bright enough for the bloom to catch. */
    disk: Radiance;
    diskDegrees: number;
    /** How fast the horizon and the middle of the sky fade upward. */
    lowFall: number;
    midFall: number;
    /** What the ground sends back up, for everything the sky lights. */
    ground: Radiance;
    stars: number;
    moon: number;
  };
  clouds: {
    coverage: number;
    softness: number;
    opacity: number;
    lit: Radiance;
    dark: Radiance;
    rim: Radiance;
    cirrus: number;
    cirrusColour: Radiance;
    drift: number;
  };
  /** How strongly the sky lights the place. */
  environment: number;
  haze: { density: number; mist: number; mistHeight: number };
  shafts: number;
  bloom: { intensity: number; threshold: number };
  grade: {
    exposure: number;
    slope: readonly [number, number, number];
    power: number;
    saturation: number;
    vignette: number;
    /** Split tone: shadows lean one way, highlights the other. */
    shadows: readonly [number, number, number];
    highlights: readonly [number, number, number];
  };
  occlusion: number;
  /** How much of each surface's own painted-on glow is kept. */
  selfGlow: number;
}

export const LOOKS: Record<LookName, LookRecipe> = {
  dusk: {
    key: {
      azimuth: 291,
      elevation: 8.5,
      colour: "#ffb878",
      intensity: 13,
      softness: 2.2,
    },
    sky: {
      zenith: ["#2f6db0", 0.9],
      midSun: ["#d9b48c", 0.8],
      midAnti: ["#7c9cc0", 0.88],
      horizonSun: ["#ffb056", 2.2],
      horizonAnti: ["#b9aeb0", 0.9],
      belt: ["#dd9a96", 0.1],
      glow: ["#ffb063", 1.0],
      disk: ["#ffe0ac", 26],
      diskDegrees: 1.1,
      lowFall: 8.5,
      midFall: 2.9,
      ground: ["#5a4a38", 0.4],
      stars: 0,
      moon: 0.12,
    },
    clouds: {
      coverage: 0.475,
      softness: 0.15,
      opacity: 0.94,
      lit: ["#ffc08a", 1.9],
      dark: ["#6d6f8c", 0.62],
      rim: ["#ffd79a", 4.5],
      cirrus: 0.2,
      cirrusColour: ["#ffcfb0", 1.0],
      drift: 0.0022,
    },
    environment: 1.3,
    haze: { density: 0.0012, mist: 0.004, mistHeight: 5 },
    shafts: 0.2,
    bloom: { intensity: 0.4, threshold: 1.3 },
    grade: {
      exposure: 1.28,
      slope: [1.06, 1.04, 1.02],
      power: 1.22,
      saturation: 1.06,
      vignette: 0.26,
      shadows: [0.99, 1.012, 0.99],
      highlights: [1.03, 1.0, 0.95],
    },
    occlusion: 1.15,
    selfGlow: 0.08,
  },
  night: {
    key: {
      azimuth: 205,
      elevation: 42,
      colour: "#a9c0f2",
      intensity: 1.05,
      softness: 3.2,
    },
    sky: {
      zenith: ["#0f1c38", 0.4],
      midSun: ["#1b2c4e", 0.5],
      midAnti: ["#1b2a48", 0.46],
      horizonSun: ["#2c3f63", 0.5],
      horizonAnti: ["#33405c", 0.5],
      belt: ["#000000", 0],
      glow: ["#9fb9ea", 0.2],
      disk: ["#000000", 0],
      diskDegrees: 0.9,
      lowFall: 6,
      midFall: 2,
      ground: ["#1a1713", 0.5],
      stars: 1.6,
      moon: 1,
    },
    clouds: {
      coverage: 0.5,
      softness: 0.18,
      opacity: 0.8,
      lit: ["#8ea4cc", 0.3],
      dark: ["#1a2133", 0.42],
      rim: ["#b7ccf2", 0.6],
      cirrus: 0.25,
      cirrusColour: ["#6c7da0", 0.3],
      drift: 0.0016,
    },
    environment: 1.7,
    haze: { density: 0.0011, mist: 0.0045, mistHeight: 4 },
    shafts: 0.12,
    bloom: { intensity: 0.8, threshold: 0.9 },
    grade: {
      exposure: 1.7,
      slope: [1, 1, 1.02],
      power: 1.1,
      saturation: 1.14,
      vignette: 0.3,
      shadows: [0.98, 1.0, 1.05],
      highlights: [1.05, 1.0, 0.92],
    },
    occlusion: 1,
    selfGlow: 0.38,
  },
};

/** Site frame: x east, z south, y up; azimuth clockwise from north. */
export function directionOf(
  azimuthDegrees: number,
  elevationDegrees: number
): Vector3 {
  const a = (azimuthDegrees * Math.PI) / 180;
  const e = (elevationDegrees * Math.PI) / 180;
  const h = Math.cos(e);
  return new Vector3(Math.sin(a) * h, Math.sin(e), -Math.cos(a) * h);
}

/** A radiance as linear light. */
export function radiance(
  [hex, strength]: Radiance,
  into: Color = new Color()
): Color {
  return into.set(hex).multiplyScalar(strength);
}
