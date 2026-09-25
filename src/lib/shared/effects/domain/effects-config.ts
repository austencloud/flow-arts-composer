/**
 * Canonical effect parameter schema.
 *
 * Owned by neither 2D nor 3D - both backends translate from it via
 * pure functions in src/lib/shared/effects/translators/.
 *
 * The intent layer describes what the user meant (fire intensity,
 * trail brightness, LED color) independent of any backend.
 */

import type { TipEffectMap } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
import type {
  FireColorCurve,
  PropFlameColor,
} from "$lib/shared/animation-engine/domain/types/fire-types";
import type { LedSimulatorConfig } from "$lib/shared/animation-engine/domain/types/led-types";

export const EFFECTS_CONFIG_VERSION = 38;

/** User-facing 2D Fire look. The renderer translates this into its internal profile. */
export type FireRenderingStyle = "natural" | "liquid";

/** Canonical Silk intensity range shared by controls, state, and persistence. */
export const SILK_INTENSITY_MIN = 0;
export const SILK_INTENSITY_MAX = 0.65;
export const SILK_INTENSITY_DEFAULT = 0.5;

export function clampSilkIntensity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return SILK_INTENSITY_DEFAULT;
  }
  return Math.max(SILK_INTENSITY_MIN, Math.min(SILK_INTENSITY_MAX, value));
}

export type EffectType =
  | "none"
  | "trails"
  | "fire"
  | "led"
  | "charcoal"
  | "zap"
  | "sparkles"
  | "ghost"
  | "bloom"
  | "goo"
  | "bubbles"
  | "petals"
  | "smoke"
  | "ink"
  | "frost"
  | "silk"
  | "animal"
  | "pulse";

export interface TrailsIntent {
  /** Which staff end(s) the trail tracks. "hand" emits from the prop center
   *  (the hand path) instead of the tips. Trails-only — other tip effects have
   *  no hand source. */
  trackingMode: "left_end" | "right_end" | "both_ends" | "hand";
  /** Abstract thickness, 1-12. Each backend interprets in native units. */
  thickness: number;
  /** 0.3-1.0. Drives opacity in 2D, emissive + alpha in 3D. */
  brightness: number;
  /** Hex string. Ignored when `rainbow` is true. */
  leftColor: string;
  /** Hex string. Ignored when `rainbow` is true. */
  rightColor: string;
  /** Hue-cycling mode. Overrides the left/right channel colors. */
  rainbow: boolean;
}

export interface FireIntent {
  /** Natural uses the defined hot-core flame; Liquid restores the broad flowing look. */
  renderingStyle: FireRenderingStyle;
  /** 0.45-1.0. Overall fire strength (drives emission rate / density). */
  intensity: number;
  /**
   * 0-1. Core glow. Maps to the 3D material's HDR emissive (uEmissiveHot),
   * which is what crosses the scene bloom threshold — the blown-out-white
   * lever. Distinct from intensity (how MUCH fire) vs brightness (how HOT
   * each particle glows). 1.0 = legacy default.
   */
  brightness: number;
  /** 0-1. 0 = natural fire color, 1 = fully prop-colored tint. */
  colorBlend: number;
  /** 0-1. Idle flicker / chaos. */
  turbulence: number;
  /** 4-stop temperature→color gradient. Null = use default curve. */
  colorCurve: FireColorCurve | null;
  /** Per-hand flame color override. Null = default blue/red. */
  propColors: [PropFlameColor, PropFlameColor] | null;
  /** Hex pair for the "Custom" preset. Null = preset not in custom mode. */
  customColors: { left: string; right: string } | null;
}

/**
 * The LED simulator settings: which device, which strip pattern, how fast it
 * loops, and the look. Shape is owned by the animation engine so the sampler,
 * the renderers, and this intent layer can never drift apart.
 */
export type LedIntent = LedSimulatorConfig;

export type CharcoalEmissionStyle =
  | "steel-wool"
  | "forge-burst"
  | "cinder-fan"
  | "banked-ember";

export interface CharcoalIntent {
  /** 0-1. Semantic intensity (RGB params derived on demand). */
  intensity: number;
  /** 0-1. Semantic spread. */
  spread: number;
  /** 0-1. Semantic glow. */
  glow: number;
  /**
   * Emission behavior. Honoured by BOTH renderers: 3D reads the full motion
   * profile, 2D reads its spark-relevant half via semanticToCharcoalParams
   * (it has no fragment class, so the fragment* fields do not apply).
   */
  emissionStyle?: CharcoalEmissionStyle;
  /** Optional hottest spark color override (RGB 0-255). Null = use default curve. */
  coreColor?: [number, number, number];
  /** Optional mid-temperature spark color override (RGB 0-255). */
  midColor?: [number, number, number];
  /** Optional coolest spark color override (RGB 0-255). */
  coolColor?: [number, number, number];
}

export interface ZapIntent {
  /** 0-1 - overall arc brightness + branch count. */
  intensity: number;
  /** Hex string - color for the blue (left) hand's zap output. */
  leftColor: string;
  /** Hex string - color for the red (right) hand's zap output. */
  rightColor: string;
  /** 1-30 strikes per second. */
  frequency: number;
  /** Legacy topology toggle, superseded by `style`. Retained for back-compat. */
  mode: "arc" | "crackle";
  /** 0-1 - fork probability per bolt (branching style). */
  branching: number;
  /**
   * Discharge character:
   * "branching" = forking storm bolts between blue↔red tip pairs (default).
   * "plasma" = thick Tesla-coil conduits shedding sputter sparks.
   * "web" = live mesh across every tip with charge pulses on the edges.
   */
  style: "branching" | "plasma" | "web";
  /** 0-1 - plasma conduit undulation SPEED. Low = slow calm bow, high = lively
   *  (never the per-frame strobe the old hardcoded random gave). */
  wobbleRate: number;
  /** 0-1 - plasma conduit bow AMPLITUDE (how far it bends off the axis). */
  wobbleAmount: number;
  /** 0-1 - glow halo size (drives shadowBlur). Decoupled from intensity so the
   *  arc can be tightened or bloomed independently. */
  glow: number;
  /** 0-1 - bolt-path roughness. Scales the jagged midpoint displacement
   *  (storm/web) and the plasma crackle octave. */
  jitter: number;
}

export interface SparklesIntent {
  /** 0-1 - particle spawn rate multiplier. */
  rate: number;
  /** 0-1 - particle scale multiplier. */
  size: number;
  /** 0.1-3.0 seconds. */
  lifetime: number;
  /** Hex string - primary tint when colorMode === "solid". */
  color: string;
  /** Multicolor palette (3-5 hex). Used when colorMode === "palette". */
  palette: string[];
  /** "solid" = use color, "rainbow" = HSL cycle, "palette" = pick random from palette. */
  colorMode: "solid" | "rainbow" | "palette";
  /** 0-30 px - radius around the tip particles spawn within. */
  spread: number;
  /** 0-1 - 0 = floaty (low gravity), 1 = fast fall (high gravity). */
  gravity: number;
  /** 'burst' = sudden bloom on motion, 'stream' = continuous, 'trail' = follows tip path. */
  mode: "burst" | "stream" | "trail";
}

/**
 * Ghost = prop onion-skin (decaying ghost trail). The real prop sprite is ghosted
 * at recent past poses, fading to nothing over a short window, so the prop trails
 * out behind himself with no persistent after-image — not a tip trail, not a
 * stick line, the actual prop graphic. See ghost-2d-renderer.ts.
 */
export interface GhostIntent {
  /** Hex — frozen exposures from the blue prop. */
  leftColor: string;
  /** Hex — frozen exposures from the red prop. */
  rightColor: string;
  /** 0-1 — overall trail opacity (master brightness). */
  intensity: number;
  /** 1-10 — Persistence: how long each ghost lingers before fading to nothing. */
  decay: number;
  /** 0-1 — Density: higher packs more ghosts into the trail (finer pose sampling). */
  interval: number;
}

export interface BloomIntent {
  /** 0-1 - peak alpha at halo center. */
  intensity: number;
  /** 0-1 - white source strength, independent of the colored halo. */
  coreStrength: number;
  /** 8-200 px - halo radius in 2D. 3D billboard scales proportionally. */
  radius: number;
  /** Hex - used when colorMode === "solid". */
  color: string;
  /** Multicolor palette (3-5 hex) - used when colorMode === "palette". */
  palette: string[];
  /**
   * "solid" = use color.
   * "prop-matched" = blue tips blue, red tips red (from trail colors).
   * "rainbow" = hue cycles with time (full cycle / 6s).
   * "palette" = pick from palette by tipIndex.
   */
  colorMode: "solid" | "prop-matched" | "rainbow" | "palette";
  /** "smooth" = gaussian falloff, "sharp" = tighter halo. "ring" is legacy-only. */
  falloff: "smooth" | "sharp" | "ring";
  /** 0-1 - breathing amplitude (0 = static halo, 1 = full on/off pulse). */
  pulse: number;
  /** 0.25-4 Hz - pulse frequency. */
  pulseRate: number;
  /** 0-1 - anamorphic motion streak. Halo stretches along the motion vector;
   *  length grows with per-frame tip speed. 0 = pure round halo. */
  streak: number;
  /** 0-1 - diffraction star-spike brightness (the lens glint off a bright
   *  point). 0 = no spikes. */
  spikes: number;
  /** 0-1 - long-exposure afterglow persistence. 0 = none (draw-fresh each
   *  frame), 1 = light trail lingers ~1s. */
  afterglow: number;
}

/**
 * Goo: viscous luminous liquid streaming off the prop, its blobs merged by the
 * metaball blur+contrast threshold. Renamed from the earlier realistic-water
 * effect (2026-06-28).
 *
 * The 2D and 3D renderers read different fields, so a setting can visibly
 * change one surface and do nothing on the other:
 * - 2D canvas (Goo2DRenderer) reads intensity, motionEmission, surfaceTension
 *   (as Viscosity), palette, customColor and trackingMode. It ignores
 *   ambientEmission, clarity and spewStyle.
 * - 3D viewer (GooRenderer3D, or the legacy WaterEmitter3D when the pooled
 *   scene-effects manager is absent) reads ambientEmission, motionEmission,
 *   intensity, clarity, palette, customColor and trackingMode. It ignores
 *   surfaceTension and spewStyle.
 */
export interface GooIntent {
  /** 0-1. 3D only: a steady droplet rate that keeps flowing while the prop is
   *  still. */
  ambientEmission: number;
  /** 0-1. 2D: how thick the stream is. 3D: extra droplets that scale with tip
   *  speed. */
  motionEmission: number;
  /** 0-1. 2D: bead size and how solid the body looks. 3D: droplet size. */
  intensity: number;
  /** Named color palette. "custom" uses customColor instead. */
  palette: "classic" | "mercury" | "acid" | "blood" | "spirit" | "custom";
  /** Hex string. Used only when palette === "custom". */
  customColor: string;
  /** 0-1. 3D only: higher is more see-through (droplet peak opacity falls from
   *  1 to 0.75). */
  clarity: number;
  /** 0-1. 2D only: Viscosity. 0 is watery, necks off early and sheds drips; 1
   *  is thick, keeps its width down the stream and rarely drips. */
  surfaceTension: number;
  /** Which staff end(s) droplets track. */
  trackingMode: "left_end" | "right_end" | "both_ends";
  /** Read by neither renderer. A droplet-era setting kept so saved configs
   *  keep their shape. */
  spewStyle: "splash" | "flow" | "mist";
}

export interface BubblesIntent {
  /** 0-1. Continuous emission at rest. */
  ambientEmission: number;
  /** 0-1. Velocity-reactive multiplier. Spin rate drives this via tip speed. */
  motionEmission: number;
  /** 0-1. Overall size + brightness. */
  intensity: number;
  /** Named palette. "custom" uses customColor instead. */
  palette: "soap" | "champagne" | "oil" | "acid" | "spirit" | "custom";
  /** Hex string. Used only when palette === "custom". */
  customColor: string;
  /** 0-1. Size variance per bubble. 0 = uniform, 1 = wide mix. */
  sizeJitter: number;
  /** 0-1. Upward rise speed scalar. */
  buoyancy: number;
  /** Which staff end(s) bubbles track. */
  trackingMode: "left_end" | "right_end" | "both_ends";
}

export interface PetalsIntent {
  /** 0-1. Continuous emission. 2D: from tip. 3D: from above scene ceiling. */
  ambientEmission: number;
  /** 0-1. Velocity-reactive burst from tip (both backends). */
  motionEmission: number;
  /** 0-1. Overall petal size + brightness. */
  intensity: number;
  /** Named palette. "custom" uses customColor. */
  palette: "blossom" | "autumn" | "jungle" | "ash" | "gold" | "custom";
  /** Hex string. Used only when palette === "custom". */
  customColor: string;
  /** 0-1. Sinusoidal sway amplitude. 3D only — drives the ambient-shower
   * flutter. The 2D backend ignores this in favor of the airstream model. */
  swayAmplitude: number;
  /** 0-1. 2D airstream: fraction of prop tip velocity a petal inherits at
   * birth. 0 = drips straight off the tip, 1 = rides the full arc. */
  carry: number;
  /** 0-1. 2D airstream: how long inherited motion lingers before settling.
   * Low = quick puff, high = long ribbon trailing the prop's path. */
  streakLength: number;
  /** 0-1. Downward velocity scalar. */
  fallSpeed: number;
  /** Which staff end(s) petals track. */
  trackingMode: "left_end" | "right_end" | "both_ends";
}

export interface InkIntent {
  /**
   * 0-1. Ambient drip rate at rest. Hard-capped at 0.3 in the renderer -
   * ink is motion-dominant. User can still dial up but even at max it
   * stays subtle. This is ink, not rain.
   */
  ambientEmission: number;
  /** 0-1. Velocity-reactive stroke emission. The star of the effect. */
  motionEmission: number;
  /** 0-1. Stroke width + opacity. */
  intensity: number;
  /** Named palette. "custom" uses customColor. */
  palette:
    | "india"
    | "sumi"
    | "watercolor"
    | "neon"
    | "blood"
    | "acid"
    | "custom";
  /** Hex string. Used only when palette === "custom". */
  customColor: string;
  /**
   * 0-1. How easily strands break into droplets under stretch.
   * 0 = continuous ribbon, 1 = shatters into drops. Shipped in the shape
   * now; sprint 2 (1j.ii) wires it through the renderer.
   */
  viscosity: number;
  /**
   * 0-1. Splatter burst intensity on velocity spikes.
   * 0 = clean strokes, 1 = Jackson Pollock. Shipped in the shape now;
   * sprint 2 (1j.iii) wires it through the renderer.
   */
  splatterIntensity: number;
  /** Explicit tracking. */
  trackingMode: "left_end" | "right_end" | "both_ends";
}

export interface SmokeIntent {
  /** 0-1. Continuous emission at rest. */
  ambientEmission: number;
  /** 0-1. Velocity-reactive multiplier. Spin rate drives this via tip speed. */
  motionEmission: number;
  /** 0-1. Overall puff size + opacity. */
  intensity: number;
  /**
   * Named palette. Personality-laden - palette carries behavioral DNA
   * (lifetime, curl bias, rise bias) alongside color. "custom" uses
   * customColor with neutral behavior defaults.
   */
  palette:
    | "incense"
    | "fog"
    | "genie"
    | "cursed"
    | "spirit"
    | "campfire"
    | "custom";
  /** Hex string. Used only when palette === "custom". */
  customColor: string;
  /** 0-1. Curl noise magnitude. 0 = straight rise, 1 = chaotic swirl. Multiplied by palette.curlBias. */
  curlStrength: number;
  /** 0-1. Upward rise speed scalar. Multiplied by palette.riseBias. */
  riseSpeed: number;
  /** Explicit tracking. */
  trackingMode: "left_end" | "right_end" | "both_ends";
}

export interface FrostIntent {
  /** 0-1. Continuous cold emission at rest. */
  ambientEmission: number;
  /** 0-1. Velocity-reactive crystal/particle emission. */
  motionEmission: number;
  /** 0-1. Crystal size + frost density. */
  intensity: number;
  /** Named palette. "custom" uses customColor. */
  palette:
    | "glacial"
    | "breath"
    | "black_ice"
    | "aurora"
    | "diamond"
    | "cursed"
    | "custom";
  /** Hex string. Used only when palette === "custom". */
  customColor: string;
  /** 0-1. Crystal angular complexity. 0 = simple hexagons, 1 = branching dendrites. */
  crystallinity: number;
  /** 0-1. How quickly frost spreads along the trail path. 0 = stays near tip, 1 = rapid coverage. */
  spreadRate: number;
  /** Explicit tracking. */
  trackingMode: "left_end" | "right_end" | "both_ends";
}

export interface SilkIntent {
  /** 0-0.65. Overall opacity + width multiplier. */
  intensity: number;
  /** 0-1. Base ribbon half-width before velocity scaling. Maps to 5-30px. */
  width: number;
  /** 0-1. Sample lifetime. Maps to 0.5-4.0 seconds. */
  duration: number;
  /** 0-1. Sine-wave edge displacement amplitude. 0 = smooth, 1 = chaotic flutter. */
  flutter: number;
  /** 0-1. How much velocity narrows the ribbon. 0 = constant width, 1 = dramatic speed contrast. */
  tautness: number;
  /** Named palette. "custom" uses customColor. */
  palette:
    | "satin"
    | "velvet"
    | "ethereal"
    | "shadow"
    | "gold_leaf"
    | "ember"
    | "custom";
  /** Hex string. Used only when palette === "custom". */
  customColor: string;
  /** Which staff end(s) the ribbon tracks. */
  trackingMode: "left_end" | "right_end" | "both_ends";
}

export interface AnimalIntent {
  /** Which creature ornaments the fixed-length chain. */
  creature: "snake" | "dragon" | "caterpillar";
  /** Named palette (shared with silk). "custom" uses customColor. */
  palette:
    | "satin"
    | "velvet"
    | "ethereal"
    | "shadow"
    | "gold_leaf"
    | "ember"
    | "custom";
  /** Hex - used only when palette === "custom". */
  customColor: string;
  /** 0-1. Overall opacity + width multiplier. */
  intensity: number;
  /** 0-1. Base body half-width. Maps to 5-30px. */
  width: number;
  /** 0-1. Body length. Maps to ~120-480px of fixed arc-length. */
  bodyLength: number;
  /** 0-1. Undulation amplitude (the wag). Ramps 0 at head → max at tail. */
  slither: number;
  /** Which staff end(s) the creature tracks. */
  trackingMode: "left_end" | "right_end" | "both_ends";
}

export interface PulseIntent {
  /** 0-1. Ring peak alpha + brightness. */
  intensity: number;
  /** 0-1. Max ring expansion radius. Maps to 20-200px. */
  reach: number;
  /** 0.2-3.0 seconds. Ring lifetime from birth to full fade. */
  lifetime: number;
  /** "beat" = on beat onsets, "velocity" = on acceleration threshold, "continuous" = steady emission amplified by beats. */
  trigger: "beat" | "velocity" | "continuous";
  /** "stroke" = thin expanding outlines, "glow" = gradient-filled halos with bright leading edge. */
  style: "stroke" | "glow";
  /** 1-8. Beat interval for beat trigger. */
  beatInterval: number;
  /** 0-1. Velocity threshold for velocity trigger. */
  velocityThreshold: number;
  /** 0-1. Ring stroke width or gradient band thickness. */
  thickness: number;
  /** Named palette. "custom" uses customColor. */
  palette: "sonar" | "ripple" | "aurora" | "neon" | "ember" | "void" | "custom";
  /** Hex string. Used only when palette === "custom". */
  customColor: string;
  /** Color selection mode. */
  colorMode: "solid" | "prop-matched" | "rainbow" | "palette";
  /** Hex - when colorMode === "solid". */
  color: string;
  /** Multicolor palette (3-5 hex) - when colorMode === "palette". */
  colorPalette: string[];
  /** Which staff end(s) emit rings. */
  trackingMode: "left_end" | "right_end" | "both_ends";
  /** 0-1. How much birth tip-speed drives ring size + brightness. */
  velocityScale: number;
  /** 0-1. Mach-cone deform strength (renderer adds a base directional floor). */
  asymmetry: number;
  /** 0-1. RGB fringe split on high-energy rings. */
  chromatic: number;
  /** 0-1. Origin detonation-flash strength. */
  flash: number;
  /** 0-1. Trailing overtone-ring count (maps to round(·*3)). */
  harmonics: number;
}

export interface EffectsConfig {
  version: number;
  tipEffectMap: TipEffectMap;
  trails: TrailsIntent;
  fire: FireIntent;
  led: LedIntent;
  charcoal: CharcoalIntent;
  zap: ZapIntent;
  sparkles: SparklesIntent;
  ghost: GhostIntent;
  bloom: BloomIntent;
  goo: GooIntent;
  bubbles: BubblesIntent;
  petals: PetalsIntent;
  smoke: SmokeIntent;
  ink: InkIntent;
  frost: FrostIntent;
  silk: SilkIntent;
  animal: AnimalIntent;
  pulse: PulseIntent;
  activePresets: {
    trails: string | null;
    fire: string | null;
    led: string | null;
    charcoal: string | null;
    zap: string | null;
    sparkles: string | null;
    ghost: string | null;
    bloom: string | null;
    goo: string | null;
    bubbles: string | null;
    petals: string | null;
    smoke: string | null;
    ink: string | null;
    frost: string | null;
    silk: string | null;
    animal: string | null;
    pulse: string | null;
  };
  /** Which effect is currently active. "none" = no effect selected. */
  activeEffect: EffectType;
  /** Per-effect render-layer override. Missing key uses that effect's layer policy. */
  effectLayerOverrides: Record<string, "behind" | "front">;
}
