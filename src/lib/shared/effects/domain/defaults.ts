import type { EffectsConfig } from "./effects-config";
import {
  EFFECTS_CONFIG_VERSION,
  SILK_INTENSITY_DEFAULT,
} from "./effects-config";
import { DEFAULT_LED_INTENT } from "$lib/shared/animation-engine/domain/types/led-types";
import { DEFAULT_TRAIL_LINE_WIDTH } from "$lib/shared/animation-engine/domain/types/trail-types";

export const DEFAULT_EFFECTS_CONFIG: EffectsConfig = {
  version: EFFECTS_CONFIG_VERSION,

  // Trails on as the global default - new users see motion paths.
  tipEffectMap: { "*": { effect: "trails" } },

  trails: {
    trackingMode: "both_ends",
    thickness: DEFAULT_TRAIL_LINE_WIDTH,
    brightness: 1.0,
    // The colour-matched prop blue/red (bright "dark mode" prop colours). This is
    // the trail Default look — matches the blue/red props on the dark canvas.
    leftColor: "#3575E2",
    rightColor: "#ED1C24",
    rainbow: false,
  },

  fire: {
    renderingStyle: "natural",
    intensity: 0.7,
    brightness: 0.5,
    colorBlend: 0,
    turbulence: 0.5,
    colorCurve: null,
    propColors: null,
    customColors: null,
  },

  led: structuredClone(DEFAULT_LED_INTENT),

  charcoal: {
    intensity: 0.5,
    spread: 0.5,
    glow: 0.6,
    emissionStyle: "steel-wool",
  },

  zap: {
    intensity: 0.7,
    leftColor: "#88ccff",
    rightColor: "#88ccff",
    frequency: 1,
    mode: "arc",
    branching: 0.35,
    style: "plasma",
    wobbleRate: 0.18,
    wobbleAmount: 0.5,
    glow: 0.5,
    jitter: 0.5,
  },

  sparkles: {
    rate: 0.5,
    size: 0.5,
    lifetime: 1.2,
    color: "#fbbf24",
    palette: ["#fbbf24", "#f59e0b", "#fde047"],
    colorMode: "solid",
    spread: 8,
    gravity: 0.3,
    mode: "stream",
  },

  // Ghost = prop onion-skin (decaying ghost trail). intensity=opacity,
  // decay=Persistence (trail length), interval=Density (higher=denser).
  // See ghost-2d-renderer.ts.
  ghost: {
    leftColor: "#3b82f6",
    rightColor: "#ef4444",
    intensity: 0.85,
    decay: 8,
    interval: 0.5,
  },

  bloom: {
    intensity: 0.5,
    coreStrength: 0.45,
    radius: 36,
    color: "#f472b6",
    palette: ["#f472b6", "#fbbf24", "#22d3ee"],
    colorMode: "rainbow",
    falloff: "smooth",
    pulse: 0,
    pulseRate: 1,
    streak: 0.4,
    spikes: 0.65,
    afterglow: 0.5,
  },

  // Goo (renamed from water 2026-06-28). In 2D, surfaceTension is the Viscosity
  // knob: 0 is watery and sheds drips, 1 congeals and clings. motionEmission is
  // Amount (stream mass). ambientEmission and clarity only reach the 3D
  // viewer's goo, and spewStyle is read by nothing; it stays for shape
  // stability. See GooIntent for the per-renderer split.
  goo: {
    ambientEmission: 0.4,
    motionEmission: 0.6,
    intensity: 0.6,
    palette: "classic",
    customColor: "#3a7fd9",
    clarity: 0.7,
    surfaceTension: 0.45,
    trackingMode: "both_ends",
    spewStyle: "flow",
  },

  bubbles: {
    ambientEmission: 0.3,
    motionEmission: 0.55,
    intensity: 0.42,
    palette: "soap",
    customColor: "#c8e0ff",
    sizeJitter: 0.45,
    buoyancy: 0.5,
    trackingMode: "both_ends",
  },

  petals: {
    // Motion-dominant: ambient is a whisper, motion drives the stream so
    // petals appear where the prop IS and trail its arc (ribbon, not cloud).
    ambientEmission: 0.22,
    motionEmission: 0.8,
    intensity: 0.5,
    palette: "blossom",
    customColor: "#ffb0c8",
    swayAmplitude: 0.6,
    carry: 0.72,
    streakLength: 0.6,
    fallSpeed: 0.4,
    trackingMode: "both_ends",
  },

  // Default smoke maps to the "classic" preset (incense palette). Palette
  // carries behavioral DNA - lifetime/curl/rise biases live there, not on
  // the intent. See docs/superpowers/specs/2026-04-15-effects-phase-1i-smoke-design.md
  smoke: {
    ambientEmission: 0.5,
    motionEmission: 0.4,
    intensity: 0.5,
    palette: "incense",
    customColor: "#e0e0e0",
    curlStrength: 0.5,
    riseSpeed: 0.5,
    trackingMode: "both_ends",
  },

  // Production default: a continuous cool-blue liquid ink. Sumi remains an
  // advanced palette, but its broad dry-brush profile no longer owns the
  // synthetic Default card.
  ink: {
    ambientEmission: 0.06,
    motionEmission: 0.9,
    intensity: 0.64,
    palette: "custom",
    customColor: "#2f8fb3",
    viscosity: 0.28,
    splatterIntensity: 0.06,
    trackingMode: "both_ends",
  },

  frost: {
    ambientEmission: 0.4,
    motionEmission: 0.5,
    intensity: 0.6,
    palette: "glacial",
    customColor: "#a0d8ff",
    crystallinity: 1.0,
    spreadRate: 0.5,
    trackingMode: "both_ends",
  },

  silk: {
    intensity: SILK_INTENSITY_DEFAULT,
    width: 0.5,
    duration: 0.5,
    flutter: 0.3,
    tautness: 0.5,
    palette: "satin",
    customColor: "#c0c0d0",
    trackingMode: "both_ends",
  },

  animal: {
    creature: "snake",
    palette: "velvet",
    customColor: "#600018",
    intensity: 0.9,
    width: 0.45,
    bodyLength: 0.62,
    slither: 0.5,
    trackingMode: "right_end",
  },

  pulse: {
    intensity: 0.7,
    reach: 0.6,
    lifetime: 1.0,
    trigger: "beat",
    style: "glow",
    beatInterval: 1,
    velocityThreshold: 0.3,
    thickness: 0.3,
    palette: "sonar",
    customColor: "#38bdf8",
    colorMode: "solid",
    color: "#38bdf8",
    colorPalette: ["#38bdf8", "#a855f7", "#22d3ee", "#f472b6", "#fbbf24"],
    trackingMode: "both_ends",
    velocityScale: 0.5,
    asymmetry: 0.45,
    chromatic: 0.3,
    flash: 0.5,
    harmonics: 0.3,
  },

  activePresets: {
    trails: null,
    fire: null,
    led: null,
    charcoal: null,
    zap: null,
    sparkles: null,
    ghost: null,
    bloom: null,
    goo: null,
    bubbles: null,
    petals: null,
    smoke: null,
    ink: null,
    frost: null,
    silk: null,
    animal: null,
    pulse: null,
  },

  activeEffect: "none",
  effectLayerOverrides: {},
};
