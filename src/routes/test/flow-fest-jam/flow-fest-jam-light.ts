/**
 * The evening's light as one function of the sun's elevation.
 *
 * The sim's visual system has four fixed moments; this slice has to pass
 * smoothly from golden hour through blue hour into the night on one clock, so
 * it keys three stops off the sun's elevation and blends between them. The
 * golden stop starts from the sim's own golden-hour values so both routes
 * agree on what 19:50 looks like. The night stop is darker than the sim's 2 AM
 * on purpose: at the jam the rope and the fire are the light, and moonlight
 * only has to separate the tree line from the sky.
 */

import { Color } from "three";
import { getFlowFestVisualProfile } from "../flow-fest-sim/flow-fest-visual-system";

export interface JamLightStop {
  elevation: number;
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  horizonGlow: string;
  horizonGlowIntensity: number;
  sunColor: string;
  sunIntensity: number;
  moonColor: string;
  moonIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogDensity: number;
  terrainTint: string;
  foliageTint: string;
  barkTint: string;
  grassTint: string;
  dressingTint: string;
  detailStrength: number;
  exposure: number;
  stars: number;
}

const golden = getFlowFestVisualProfile("golden-hour");

/** Ordered high to low. */
const STOPS: JamLightStop[] = [
  {
    elevation: 9,
    skyTop: "#3d6a92",
    skyMid: "#9aa0a6",
    skyBottom: "#e6b27c",
    horizonGlow: "#ffb46a",
    horizonGlowIntensity: 0.45,
    sunColor: "#ffd9a0",
    sunIntensity: 2.4,
    moonColor: "#9fb6e0",
    moonIntensity: 0,
    hemiSky: golden.hemisphere.sky,
    hemiGround: golden.hemisphere.ground,
    hemiIntensity: 0.7,
    fogColor: "#a08672",
    fogDensity: 0.0018,
    terrainTint: golden.grade.terrainTint,
    foliageTint: "#c9d39a",
    barkTint: golden.grade.barkTint,
    grassTint: "#e2cc98",
    dressingTint: golden.grade.dressingTint,
    detailStrength: 0.62,
    exposure: 1.02,
    stars: 0,
  },
  {
    elevation: 2,
    skyTop: golden.sky.top,
    skyMid: golden.sky.mid,
    skyBottom: golden.sky.bottom,
    horizonGlow: "#ff8f4a",
    horizonGlowIntensity: 0.7,
    sunColor: golden.sun.color,
    sunIntensity: 1.7,
    moonColor: "#9fb6e0",
    moonIntensity: 0.02,
    hemiSky: "#a0a8b4",
    hemiGround: "#3a3a2e",
    hemiIntensity: 0.58,
    fogColor: golden.fog.color,
    fogDensity: golden.fog.density,
    terrainTint: "#c8b892",
    foliageTint: "#bfbf8c",
    barkTint: "#c99f7a",
    grassTint: "#cfa881",
    dressingTint: "#e8bf98",
    detailStrength: 0.58,
    exposure: 1.05,
    stars: 0,
  },
  {
    // Blue hour: the sun is gone, the west still glows, everything else goes blue.
    elevation: -4,
    skyTop: "#162a4c",
    skyMid: "#4a5578",
    skyBottom: "#b8706a",
    horizonGlow: "#e0784e",
    horizonGlowIntensity: 0.55,
    sunColor: "#ff9a6a",
    sunIntensity: 0.12,
    moonColor: "#a5bbe6",
    moonIntensity: 0.12,
    hemiSky: "#5a6c94",
    hemiGround: "#1a1d22",
    hemiIntensity: 0.5,
    fogColor: "#2a3048",
    fogDensity: 0.0026,
    terrainTint: "#7c8494",
    foliageTint: "#6c7a80",
    barkTint: "#7a6c6a",
    grassTint: "#9aa6b8",
    dressingTint: "#a4a8bc",
    detailStrength: 0.4,
    exposure: 1.12,
    stars: 0.15,
  },
  {
    // Full night. Dark is dark: the moon only separates ridge from sky.
    elevation: -11,
    skyTop: "#03070f",
    skyMid: "#0a1426",
    skyBottom: "#16192c",
    horizonGlow: "#2a2440",
    horizonGlowIntensity: 0.12,
    sunColor: "#000000",
    sunIntensity: 0,
    moonColor: "#8eaee6",
    moonIntensity: 0.24,
    hemiSky: "#2a3c60",
    hemiGround: "#05070a",
    hemiIntensity: 0.16,
    fogColor: "#04070e",
    fogDensity: 0.0042,
    terrainTint: "#46505e",
    foliageTint: "#3c4a48",
    barkTint: "#4c4442",
    grassTint: "#7a8c98",
    dressingTint: "#7c8698",
    detailStrength: 0.18,
    exposure: 1.18,
    stars: 1,
  },
];

const COLOR_KEYS = [
  "skyTop",
  "skyMid",
  "skyBottom",
  "horizonGlow",
  "sunColor",
  "moonColor",
  "hemiSky",
  "hemiGround",
  "fogColor",
  "terrainTint",
  "foliageTint",
  "barkTint",
  "grassTint",
  "dressingTint",
] as const;
const NUMBER_KEYS = [
  "horizonGlowIntensity",
  "sunIntensity",
  "moonIntensity",
  "hemiIntensity",
  "fogDensity",
  "detailStrength",
  "exposure",
  "stars",
] as const;

const ca = new Color();
const cb = new Color();

export function jamLightAt(elevationDegrees: number): JamLightStop {
  const e = Math.max(STOPS[STOPS.length - 1]!.elevation, Math.min(STOPS[0]!.elevation, elevationDegrees));
  let i = 0;
  while (i + 2 < STOPS.length && STOPS[i + 1]!.elevation >= e) i++;
  const a = STOPS[i]!;
  const b = STOPS[i + 1]!;
  const raw = (a.elevation - e) / (a.elevation - b.elevation);
  const t = raw * raw * (3 - 2 * raw);
  const out = { elevation: elevationDegrees } as JamLightStop;
  for (const key of COLOR_KEYS) {
    // Blend in linear light so the blue hour does not pass through grey mud.
    ca.set(a[key]);
    cb.set(b[key]);
    out[key] = `#${ca.lerp(cb, t).getHexString()}`;
  }
  for (const key of NUMBER_KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
  return out;
}

/**
 * Direction toward the sun for an evening elevation. Mid-May at 39.6 degrees
 * north the sun sets about 22 degrees north of west and swings north as it
 * goes, so the azimuth tracks the elevation a little. Site frame: x east,
 * z south, y up.
 */
export function jamSunDirection(elevationDegrees: number): [number, number, number] {
  const azimuth = ((296 - elevationDegrees * 0.9) * Math.PI) / 180;
  // Keep the light above the ground plane even when the disk has set: below
  // the horizon what remains is sky light from the west, not light from below.
  const elevation = (Math.max(elevationDegrees, 1.5) * Math.PI) / 180;
  const h = Math.cos(elevation);
  return [Math.sin(azimuth) * h, Math.sin(elevation), -Math.cos(azimuth) * h];
}

/** First-quarter moon, high in the south-south-west at dusk. */
export const JAM_MOON_DIRECTION: [number, number, number] = (() => {
  const azimuth = (205 * Math.PI) / 180;
  const elevation = (42 * Math.PI) / 180;
  const h = Math.cos(elevation);
  return [Math.sin(azimuth) * h, Math.sin(elevation), -Math.cos(azimuth) * h];
})();
