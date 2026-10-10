/**
 * LED Overlay Types (v2 — physical LED prop simulator)
 *
 * The LED effect previews what a real LED prop looks like running a given
 * mode: a device (capsule or pixel staff), a strip pattern that loops on its
 * own clock, and a look (glow, persistence, bloom, brightness).
 *
 * Pattern data itself is owned by `#lib/shared/poi/domain` — the same
 * `StripPattern` currency the Poi Lab authors and uploads to hardware.
 */

import type { PatternParams, RGBColor } from "#lib/shared/poi/domain/strip-pattern.js";
import {
  DEFAULT_GLARE_WEIGHT,
  DEFAULT_LED_SHUTTER,
  type LedShutter,
} from "../led-photometry";

export type { LedShutter };

/** Canonical prop colors matching the domain (blue hand = propIndex 0, red hand = propIndex 1) */
export const PROP_BLUE = "#2196f3";
export const PROP_RED = "#f44336";


export type LedDeviceKind = "capsule" | "pixel-staff";

/** A capsule prop lights only its two shaft ends. */
export const CAPSULE_LED_COUNT = 2;

/**
 * Pixel-staff LED counts are fixed options, not a free slider — you pick a
 * prop. 200 matches the Ignis iPixel 200 HD; 32 and 72 are common shorter
 * strips and cheaper render tiers.
 */
export const PIXEL_STAFF_LED_COUNTS = [32, 72, 200] as const;
export type PixelStaffLedCount = (typeof PIXEL_STAFF_LED_COUNTS)[number];

export interface LedDevice {
  kind: LedDeviceKind;
  /** Capsule is always CAPSULE_LED_COUNT; pixel staff is one of PIXEL_STAFF_LED_COUNTS. */
  ledCount: number;
}

/** Clamp an arbitrary device description onto a supported device. */
export function normalizeLedDevice(kind: LedDeviceKind, ledCount: number): LedDevice {
  if (kind === "capsule") return { kind, ledCount: CAPSULE_LED_COUNT };
  const nearest = PIXEL_STAFF_LED_COUNTS.reduce((best, option) =>
    Math.abs(option - ledCount) < Math.abs(best - ledCount) ? option : best
  );
  return { kind: "pixel-staff", ledCount: nearest };
}

// ─── Pattern source ───────────────────────────────────────────────────────────

export type LedPatternSource =
  | { source: "generator"; generatorId: string; params: PatternParams }
  | { source: "image"; libraryEntryId: string };

/** Frames per materialized pattern loop. One clock drives both props. */
export const LED_PATTERN_FRAME_COUNT = 180;

/** Seconds per full pattern loop, matching the Poi Lab staff preview range. */
export const CYCLE_DURATION_MIN = 0.2;
export const CYCLE_DURATION_MAX = 30;

export function clampCycleDuration(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CYCLE_DURATION;
  return Math.max(CYCLE_DURATION_MIN, Math.min(CYCLE_DURATION_MAX, value));
}

export const DEFAULT_CYCLE_DURATION = 3;


/**
 * How the light is captured, not how each LED is drawn.
 *
 * Every field here is a camera property applied once to the whole frame. The
 * previous shape carried per-LED values (`glowRadius` as an absolute sprite
 * radius, `trailFadeRate` as a per-frame decay) which made LED count act as a
 * brightness multiplier and made persistence framerate-dependent. Emitter size
 * is now derived from LED pitch in `domain/led-photometry.ts` and is not
 * authorable — a real LED's size is a fact about the prop, not a preference.
 */
export interface LedLook {
  /**
   * Persistence model: `eye` is exponential visual persistence, `camera` is a
   * long-exposure box shutter. See `LedShutter` in `domain/led-photometry.ts`.
   */
  shutter: LedShutter;
  /**
   * Glare falloff shape (GLARE_WEIGHT_MIN - GLARE_WEIGHT_MAX). Low values give
   * a tight beam around each LED, high values the broad inverse-square veil of
   * a real camera. This is the bloom pyramid's per-mip weight.
   */
  glare: number;
  /** Discrete level 1-5, resolved through LED_BRIGHTNESS_LEVELS. Scales prop flux. */
  brightness: number;
}


/**
 * The user-facing LED simulator settings. `LedIntent` in the effects-config
 * intent layer aliases this shape; `LedOverlayConfig` adds the runtime
 * enable flag the 2D overlay lifecycle reads.
 */
export interface LedSimulatorConfig {
  device: LedDevice;
  pattern: LedPatternSource;
  /** Seconds per full pattern loop, clamped to [CYCLE_DURATION_MIN, CYCLE_DURATION_MAX]. */
  cycleDuration: number;
  look: LedLook;
}

export interface LedOverlayConfig extends LedSimulatorConfig {
  /** Whether the LED overlay effect is enabled */
  enabled: boolean;
}


/**
 * One addressable LED for one frame, produced by the LED sampler.
 * Positions are in viewbox coordinates (e.g. 950x950).
 */
export interface LedSample {
  /** X position in viewbox coordinates */
  x: number;
  /** Y position in viewbox coordinates */
  y: number;
  /** 0 = base blue prop, 1 = base red prop; >= 2 = overlaid tunnel-layer props */
  propIndex: number;
  /** Index of this LED along the strip, 0 = the first tracked endpoint */
  ledIndex: number;
  /** Which shaft end this LED sits nearest — the key tip-effect assignment uses */
  endpointIndex: number;
  /** Output brightness for this LED, normalized to [0, 1] */
  brightness: number;
  /** Red channel, normalized to [0, 1] */
  r: number;
  /** Green channel, normalized to [0, 1] */
  g: number;
  /** Blue channel, normalized to [0, 1] */
  b: number;
}

/**
 * Full frame input passed to the LED renderer each RAF tick.
 */
export interface LedFrameInput {
  /** Every lit LED this frame, across every prop */
  leds: LedSample[];
  /** Current time from performance.now() */
  currentTime: number;
  /** Canvas width in viewbox coordinates (e.g. 950) */
  canvasWidth: number;
  /** Canvas height in viewbox coordinates (e.g. 950) */
  canvasHeight: number;
  /**
   * LED sets at the sub-frame instants since the previous frame, oldest
   * first, each the same shape as `leds`. The renderer deposits one streak
   * pass per set, then the final pass for `leds`, sharing the frame's shutter.
   * Absent at a healthy frame rate and during export.
   */
  priorSamples?: readonly (readonly LedSample[])[];
}


/**
 * Discrete brightness levels matching physical LED prop controls.
 * Index 0 = dimmest (level 1), index 4 = full brightness (level 5).
 */
export const LED_BRIGHTNESS_LEVELS = [0.2, 0.4, 0.6, 0.8, 1.0] as const;

/**
 * Convert a user-facing brightness level (1-5) to a 0-1 float.
 * Clamps out-of-range inputs to the nearest valid level.
 */
export function ledBrightnessToFloat(level: number): number {
  const clamped = Math.max(1, Math.min(5, Math.round(level)));
  return LED_BRIGHTNESS_LEVELS[clamped - 1]!;
}

/**
 * Convert a CSS hex color (#rrggbb) to normalized [0, 1] RGB for shader use.
 */
export function hexToLedColor(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

/** Convert a CSS hex color (#rrggbb) to the 0-255 RGBColor the generators take. */
export function hexToRgb255(hex: string): RGBColor {
  const normalized = hex.trim().replace(/^#/, "");
  if (normalized.length !== 6) return { r: 255, g: 255, b: 255 };
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return { r: 255, g: 255, b: 255 };
  }
  return { r, g, b };
}

/**
 * Pattern params are materialized at full brightness; the look's discrete
 * 1-5 level is applied per-LED at sample time so changing brightness never
 * costs a pattern regeneration.
 */
export const PATTERN_MATERIALIZE_BRIGHTNESS = 1;

export const DEFAULT_LED_LOOK: LedLook = {
  shutter: { ...DEFAULT_LED_SHUTTER },
  glare: DEFAULT_GLARE_WEIGHT,
  // Level 3 (0.6) — full-bright reads as blinding against the dark stage.
  brightness: 3,
};

/**
 * Default simulator settings: a capsule prop showing canonical prop identity,
 * looping once every 3 seconds.
 */
export const DEFAULT_LED_INTENT: LedSimulatorConfig = {
  device: { kind: "capsule", ledCount: CAPSULE_LED_COUNT },
  pattern: {
    source: "generator",
    generatorId: "prop-colors",
    params: {
      primaryColor: hexToRgb255(PROP_BLUE),
      secondaryColor: hexToRgb255(PROP_RED),
      speed: 1,
      brightness: PATTERN_MATERIALIZE_BRIGHTNESS,
    },
  },
  cycleDuration: DEFAULT_CYCLE_DURATION,
  look: { ...DEFAULT_LED_LOOK },
};

/** Default LED overlay config — disabled until an effect assignment turns it on. */
export const DEFAULT_LED_CONFIG: LedOverlayConfig = {
  enabled: false,
  ...structuredClone(DEFAULT_LED_INTENT),
};
