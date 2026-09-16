import type { CharcoalSparkParams } from "./charcoal-spark-types";
import type { RenderedPropSprite } from "./rendered-prop-sprite";
/**
 * Fire Overlay Types
 *
 * Domain types for the WebGL fire overlay that renders physically-based
 * fire at prop endpoints using Navier-Stokes fluid simulation with
 * combustion, buoyancy, and blackbody radiation rendering.
 */

/** Renderer type determines which WebGL pipeline handles this fuel */
export type FuelRendererType = "fluid";

/** Natural Fire uses the cinematic profile. The preserved legacy profile powers
 * the user-facing Liquid Fire preset and the visual comparison harness. */
export type FireRenderingProfile = "cinematic" | "legacy";

/** Color curve for the fluid renderer's display pass.
 *  Maps normalized temperature through 4 color stops
 *  instead of the hardcoded blackbody ramp. */
export interface FireColorCurve {
  /** RGB [0-1] at lowest visible temperature (dark ember glow) */
  coldColor: [number, number, number];
  /** RGB [0-1] at mid combustion (main flame body) */
  midColor: [number, number, number];
  /** RGB [0-1] at peak combustion (bright flame) */
  hotColor: [number, number, number];
  /** RGB [0-1] at wick core (brightest point, near-white) */
  coreColor: [number, number, number];
}

/**
 * RGB color for a prop, normalized to [0, 1] for shader consumption.
 */
export interface PropFlameColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Per-tip data computed each frame by FireTipTracker.
 * Positions are in viewbox coordinates (e.g. 950x950).
 */
export interface PropTipData {
  /** X position in viewbox coordinates */
  x: number;
  /** Y position in viewbox coordinates */
  y: number;
  /** Previous frame X position in viewbox coordinates (for sub-frame interpolation) */
  prevX: number;
  /** Previous frame Y position in viewbox coordinates (for sub-frame interpolation) */
  prevY: number;
  /** Horizontal velocity (viewbox units/second) */
  velocityX: number;
  /** Vertical velocity (viewbox units/second) */
  velocityY: number;
  /** Speed magnitude (viewbox units/second) */
  speed: number;
  /** Horizontal acceleration (viewbox units/second squared) */
  accelerationX?: number;
  /** Vertical acceleration (viewbox units/second squared) */
  accelerationY?: number;
  /** 0 = base blue prop, 1 = base red prop; >= 2 = overlaid tunnel-layer props
   *  (2+2*layer = layer blue, 3+2*layer = layer red). Effects filter by this. */
  propIndex: number;
  /** Index of this fire point within the prop's fire point array */
  tipIndex: number;
  /** Relative flame size (affects splat radius and fuel injection) */
  flameScale: number;
  /** Acceleration magnitude - |velocity_delta| / dt (viewbox units/s^2). 0 on first frame. */
  jerk: number;
}

/**
 * Transform data exported by the Canvas2D renderer after drawing a prop.
 * Used by FireTipTracker to eliminate duplicate coordinate computation.
 */
export interface RenderedPropTransform {
  /** Prop center X in canvas coordinates */
  centerX: number;
  /** Prop center Y in canvas coordinates */
  centerY: number;
  /** staffRotationAngle used for drawing (radians) */
  angle: number;
  /** gridScaleFactor = canvasSize / VIEWBOX_SIZE */
  scaleFactor: number;
}

/**
 * Full frame input passed to the fire renderer each RAF tick.
 */
export interface FireFrameInput {
  /** Active tip positions + velocities (up to 4 tips) */
  tips: PropTipData[];
  /** Current time from performance.now() */
  currentTime: number;
  /** Simulation timestep in SECONDS. When provided (export path), the sim steps
   *  deterministically on it. When omitted (live, until every caller is
   *  migrated), the renderer falls back to its wall-clock delta so live behavior
   *  is byte-identical. */
  dt?: number;
  /** Canvas dimensions in viewbox coordinates (e.g. 950x950) */
  canvasWidth: number;
  canvasHeight: number;
  /** Whether dark mode is active (affects intensity) */
  darkMode: boolean;
  /** Prop sprites exactly as the main canvas painted them this frame. Natural
   * Fire uses their alpha silhouettes to keep dense foreground flame from
   * erasing the props underneath. */
  propSprites?: readonly RenderedPropSprite[];
  /** Prop colors for colored flames, indexed by tip.propIndex.
   *  [0]=base blue, [1]=base red; [2+2*li]/[3+2*li]=tunnel-layer blue/red.
   *  The base pair is always present; extra entries appear only when the
   *  tunnel stacks overlaid layers, so the fire splat reads a distinct
   *  spectrum color per kaleidoscope copy. */
  propColors?: PropFlameColor[];
  /** Set to true on the frame where the animation loops back to the start */
  loopDetected?: boolean;
  /** Duration of the loop that just ended, in the same phase units as
   * relativeTime. This is the authoritative cache boundary; it is intentionally not inferred from
   * the final sampled frame. */
  loopDuration?: number;
  /** A tracker gap, paused seek, or stalled frame changed playback continuity.
   * This is distinct from a real sequence wrap and must never complete a
   * frame-cache recording. */
  playbackDiscontinuity?: boolean;
  /** Playback speed multiplier (1.0 = 60 BPM). Used for cache invalidation - different speeds produce different fire physics. */
  playbackSpeed?: number;
  /** Changes when the sequence content changes. Invalidates fire cache so stale frames don't replay over new props. */
  sequenceContentHash?: string;
  /** Changes when the props' artwork or tip geometry changes: the loaded
   * render keys of both hands plus the tip points each resolves to. Invalidates
   * the fire cache so a look change never replays flames recorded for other
   * artwork. */
  propGeometryKey?: string;
  /** Continuous sequence phase used for timestamp-indexed cache playback.
   * Render-loop callers use fractional currentStep, so pauses and seeks cannot
   * advance this coordinate independently of the props. */
  relativeTime?: number;
  /** Whether the sequence loops seamlessly (end position = start position). When true, fire should NOT be cleared on loop - it should continue naturally. */
  isSeamlesslyLoopable?: boolean;
}

/**
 * Physics parameters for the Navier-Stokes fluid simulation.
 * Each preset defines a complete set of these values.
 */
export interface FirePhysicsParams {
  /** Gaussian splat radius for fuel/velocity injection (0.004 - 0.025) */
  splatRadius: number;
  /** Base fuel injection amount per frame (0.1 - 2.0) */
  fuelAmount: number;
  /** How strongly tip velocity feeds into the sim (0.0001 - 0.002) */
  velocityInjectScale: number;
  /** Velocity field decay per step. Lower = faster decay = shorter trails (0.88 - 0.995) */
  velocityDissipation: number;
  /** Temperature field decay per step. Lower = faster cooling = shorter visible trail (0.88 - 0.995) */
  temperatureDissipation: number;
  /** Fuel field decay per step. Lower = fuel burns out faster (0.88 - 0.995) */
  fuelDissipation: number;
  /** Vorticity confinement strength. Higher = more turbulence/swirl (1.0 - 20.0) */
  vorticityStrength: number;
  /** How strongly hot gas rises. Needs ~30-150 for visible upward motion (10 - 200) */
  buoyancyStrength: number;
  /** How fast fuel converts to heat (1.0 - 8.0) */
  burnRate: number;
  /** Heat generated per unit fuel burned (1.0 - 5.0) */
  fuelEfficiency: number;
  /** Active cooling rate during combustion. Higher = faster cooldown (1.0 - 8.0) */
  coolingRate: number;
  /** Pressure field decay between Jacobi iterations (0.5 - 1.0) */
  pressureDissipation: number;
  /** Base temperature injection at each tip per frame (0.3 - 4.0) */
  temperatureInjection: number;
  /** Constant upward velocity injected at tip via splat (0.5 - 8.0) */
  upwardBias: number;
  /** Constant downward force on heated fluid. 0 = no gravity (normal fire). Negative = downward pull. (-10 to 0) */
  gravity: number;
}

/**
 * User-configurable fire overlay settings.
 */
export interface FireOverlayConfig {
  /** Display intensity multiplier (0.1 - 3.0, default 1.0) */
  intensity: number;
  /** HDR emission control (0-1). Changes how hot the flame photographs without
   * changing the amount of fuel, heat, or simulated flame volume. */
  brightness?: number;
  /** Flame height / buoyancy strength multiplier (0.3 - 3.0, default 1.0) */
  flameHeight: number;
  /** Whether fire reacts to spin velocity */
  velocityReactive: boolean;
  /**
   * Quality level controlling simulation resolution:
   *   2 = 128x128 grid (low, mobile-friendly)
   *   3 = 192x192 grid (medium)
   *   4 = 256x256 grid (high, default)
   */
  quality: number;
  /** Flame color blend: 0.0 = natural fire, 1.0 = prop-colored fire */
  colorBlend?: number;
  /** Optional physics preset to apply. When set, overrides the renderer's base physics. */
  physicsPreset?: FirePhysicsParams;
  /** Active fuel source ID (replaces preset system) */
  fuelSourceId?: string;
  /** Which renderer to use for this fuel */
  fuelRendererType?: FuelRendererType;
  /** Color curve for the fluid renderer display pass */
  colorCurve?: FireColorCurve;
  /** Disable frame caching - forces live simulation every frame. Use when external
   *  easing/timing makes cached frames drift from actual prop positions (e.g. effort labs). */
  disableFrameCache?: boolean;
  /** Charcoal spark params (only used when useCharcoal is true) */
  charcoalParams?: CharcoalSparkParams;
  /** Curl noise turbulence strength (0.0-1.0). Controls how much idle fire flickers
   *  via divergence-free velocity perturbation at flame boundaries. 0 = static plume,
   *  0.5 = natural flicker, 1.0 = aggressive turbulence. */
  turbulence?: number;
  /** HDR bloom strength (0.0 = no bloom, 0.04-0.15 = subtle glow, default 0.08) */
  bloomStrength?: number;
  /**
   * Jacobi pressure-solve iterations per frame.
   * Higher = more accurate pressure field, but more GPU draw calls.
   * Fire doesn't need physical accuracy - visual plausibility is sufficient.
   *   20 = default (single instance, no visible difference from 30)
   *   15 = 2-4 simultaneous instances
   *   10 = 5+ simultaneous instances
   */
  jacobiIterations?: number;
  /** Renderer-quality profile. Omitted means the production cinematic path. */
  renderingProfile?: FireRenderingProfile;
}

/** Default physics parameters - tuned for fire spinning (shorter trails, wick-focused) */
export const DEFAULT_PHYSICS: FirePhysicsParams = {
  splatRadius: 0.018,
  fuelAmount: 0.55,
  velocityInjectScale: 0.0006,
  velocityDissipation: 0.955,
  temperatureDissipation: 0.945,
  fuelDissipation: 0.935,
  vorticityStrength: 3.5,
  buoyancyStrength: 40,
  burnRate: 3.5,
  fuelEfficiency: 2.5,
  coolingRate: 3.5,
  pressureDissipation: 0.8,
  temperatureInjection: 1.1,
  upwardBias: 2.0,
  gravity: 0,
};

/** Default fire overlay config */
export const DEFAULT_FIRE_CONFIG: FireOverlayConfig = {
  intensity: 1.0,
  brightness: 0.5,
  flameHeight: 1.0,
  velocityReactive: true,
  quality: 2, // 128×128 grid - fire is inherently noisy, higher resolution is imperceptible
};

/**
 * Convert a CSS hex color (#rrggbb) to normalized [0,1] RGB for shader use.
 */
export function hexToFlameColor(hex: string): PropFlameColor {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}

/** Inverse of {@link hexToFlameColor}: normalized [0,1] RGB → CSS hex (#rrggbb). */
export function flameColorToHex(c: PropFlameColor): string {
  const channel = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(c.r)}${channel(c.g)}${channel(c.b)}`;
}

/** Default prop flame colors (blue/red) */
export const DEFAULT_PROP_FLAME_COLORS: [PropFlameColor, PropFlameColor] = [
  hexToFlameColor("#3b82f6"), // blue (left prop)
  hexToFlameColor("#ef4444"), // red (right prop)
];

// ============================================================================
// BASE CONSTANTS - White gas physics/colors as the canonical baseline
// ============================================================================

/** White gas fluid physics - bright, fast burn, the standard for fire spinning */
export const BASE_FIRE_PHYSICS: FirePhysicsParams = {
  splatRadius: 0.012,
  fuelAmount: 1.0,
  velocityInjectScale: 0.001,
  velocityDissipation: 0.935,
  temperatureDissipation: 0.93,
  fuelDissipation: 0.93,
  vorticityStrength: 8.0,
  buoyancyStrength: 80.0,
  burnRate: 5.0,
  fuelEfficiency: 2.5,
  coolingRate: 4.0,
  pressureDissipation: 0.8,
  temperatureInjection: 1.5,
  upwardBias: 3.0,
  gravity: 0,
};

/** White gas color curve - natural fire colors */
export const BASE_COLOR_CURVE: FireColorCurve = {
  coldColor: [0.2, 0.02, 0.0],
  midColor: [0.9, 0.15, 0.0],
  hotColor: [1.0, 0.55, 0.05],
  coreColor: [1.0, 0.9, 0.35],
};

/**
 * Charcoal/steel-wool fluid physics.
 * Low buoyancy so only the hottest gas rises. Gravity pulls the bulk downward.
 * Large splat radius + high fuel for a dense, voluminous cloud.
 * Heavy soot for thick smoke billowing around the falling embers.
 */
export const CHARCOAL_FIRE_PHYSICS: FirePhysicsParams = {
  splatRadius: 0.018,
  fuelAmount: 1.4,
  velocityInjectScale: 0.0012,
  velocityDissipation: 0.94,
  temperatureDissipation: 0.955,
  fuelDissipation: 0.945,
  vorticityStrength: 6.0,
  buoyancyStrength: 5.0,
  burnRate: 4.0,
  fuelEfficiency: 2.0,
  coolingRate: 3.0,
  pressureDissipation: 0.8,
  temperatureInjection: 1.8,
  upwardBias: -6.0,
  gravity: -10000.0,
};

/** Charcoal color curve - steel-wool orange/white palette */
export const CHARCOAL_COLOR_CURVE: FireColorCurve = {
  coldColor: [0.4, 0.08, 0.0],
  midColor: [0.9, 0.3, 0.02],
  hotColor: [1.0, 0.6, 0.1],
  coreColor: [1.0, 0.95, 0.8],
};

// ============================================================================
// SLIDER-TO-PHYSICS MAPPING - Maps user-facing 0-1 sliders to physics params
// ============================================================================

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Map user-facing intensity (0-1) to physics overrides.
 * 1.0 = "normal fire" (white gas baseline). 0.0 = barely visible embers.
 */
export function intensityToPhysics(
  intensity: number
): Partial<FirePhysicsParams> {
  return {
    fuelAmount: lerp(0.2, 1.6, intensity),
    temperatureInjection: lerp(0.4, 2.2, intensity),
    buoyancyStrength: lerp(20, 120, intensity),
    upwardBias: lerp(0.8, 4.5, intensity),
    burnRate: lerp(2.0, 7.0, intensity),
  };
}
