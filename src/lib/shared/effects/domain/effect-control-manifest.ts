/**
 * Shared per-effect control manifest.
 *
 * Single source of truth for what tuning controls each effect exposes. Both the
 * 2D customize panels and the 3D viewer FX popover render from this via
 * EffectControlStack, so editing a control here changes both surfaces — "fix 2D
 * → fixes 3D" by construction.
 *
 * Every effect has a uniform Primary row (Color/Palette · Intensity · two
 * character knobs, 3–6 controls) so effects feel equally simple to control;
 * deeper params live under tier "advanced". `tracking` is the prop-aware end
 * selector for tip-emission effects.
 *
 * Spec: docs/superpowers/specs/2026-06-21-effect-control-consolidation-design.md
 */

import type { EffectId } from "$lib/shared/effects/state/effects-config-state.svelte";
import { SILK_INTENSITY_MAX } from "$lib/shared/effects/domain/effects-config";
import { getBilateralEndLabels } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";

export type ControlType =
  | "slider"
  | "toggle"
  | "chip"
  | "segmented"
  | "color"
  | "colorPair"
  | "palette"
  | "paletteSwatches";
export type ControlTier = "primary" | "tracking" | "advanced";

export interface ControlDescriptor {
  id: string;
  label: string;
  type: ControlType;
  /** Intent field on the effect's config object (the key passed to updateEffect). */
  field: string;
  tier: ControlTier;
  // slider
  min?: number;
  max?: number;
  step?: number;
  pct?: boolean;
  // segmented / select
  options?: { value: string; label: string }[];
  // colorPair: the two hand-relative color fields.
  pairFields?: [string, string];
  // palette: named options (swatch optional, cosmetic)
  paletteOptions?: { value: string; label: string; swatch?: string }[];
  // chip: a boolean rendered as a toggle chip with a preview swatch
  swatch?: "rainbow";
  // conditional visibility (e.g. tint only when palette === "custom")
  showWhen?: (intent: Record<string, unknown>) => boolean;
  /** Keep this control out of the compact mobile tune strip while preserving
   *  it in the full desktop inspector. Defaults to true. */
  compact?: boolean;
}

const TRACK_OPTS = [
  { value: "left_end", label: "End 1" },
  { value: "both_ends", label: "Both Ends" },
  { value: "right_end", label: "End 2" },
];

// Trails-only: emit from the hand path (prop center) instead of the tips. The
// other tip effects source from a different pipeline (fire-tip-tracker) and do
// not support Hand, so this option is scoped to the trails Track control.
const TRAILS_TRACK_OPTS = [
  ...TRACK_OPTS,
  { value: "hand", label: "Hand" },
];

function compactEndLabel(label: string): string {
  return label.replace(/ End$/, "");
}

/**
 * Translate the legacy left/right tracking values into the names carried by
 * the selected prop. Staff controls read Pinky / Pinky + Thumb / Thumb while
 * the persisted values and renderer routing remain unchanged.
 */
export function resolveEffectControlOptions(
  control: ControlDescriptor,
  propType: string | null | undefined,
): { value: string; label: string }[] {
  const options = control.options ?? [];
  if (control.field !== "trackingMode") return options;

  const [leftEnd, rightEnd] = getBilateralEndLabels(propType ?? "");
  const left = compactEndLabel(leftEnd);
  const right = compactEndLabel(rightEnd);
  const combined =
    leftEnd === "End 1" && rightEnd === "End 2"
      ? "Both Ends"
      : `${left} + ${right}`;

  return options.map((option) => {
    if (option.value === "left_end") return { ...option, label: left };
    if (option.value === "both_ends") return { ...option, label: combined };
    if (option.value === "right_end") return { ...option, label: right };
    return option;
  });
}

const isCustomPalette = (i: Record<string, unknown>) => i.palette === "custom";

/** Build a palette descriptor + its conditional custom-tint, the shared shape
 *  every named-palette effect uses for its Primary "Color". */
function paletteColor(
  effect: string,
  values: { value: string; label: string }[],
): ControlDescriptor[] {
  return [
    { id: `${effect}-palette`, label: "Color", type: "palette", field: "palette", tier: "primary", paletteOptions: values },
    { id: `${effect}-tint`, label: "Tint", type: "color", field: "customColor", tier: "primary", showWhen: isCustomPalette },
  ];
}

const slider = (
  effect: string,
  field: string,
  label: string,
  opts: Partial<ControlDescriptor> & { tier: ControlTier },
): ControlDescriptor => ({
  id: `${effect}-${field}`,
  label,
  type: "slider",
  field,
  min: 0,
  max: 1,
  step: 0.05,
  pct: true,
  ...opts,
});

export const EFFECT_CONTROLS: Record<EffectId, ControlDescriptor[]> = {
  trails: [
    { id: "trails-color", label: "Colors", type: "colorPair", field: "leftColor", pairFields: ["leftColor", "rightColor"], tier: "primary" },
    { id: "trails-rainbow", label: "Rainbow", type: "chip", field: "rainbow", tier: "primary", swatch: "rainbow" },
    slider("trails", "brightness", "Brightness", { min: 0.3, max: 1, tier: "primary" }),
    slider("trails", "thickness", "Thickness", { min: 1, max: 12, step: 0.5, pct: false, tier: "primary" }),
    // tailLength lives in animationSettings.trail (see canvas2d-translator), NOT
    // effectsConfig.trails — host passes a cross-store override for this field.
    slider("trails", "tailLength", "Tail", { min: 10, max: 400, step: 5, pct: false, tier: "primary" }),
    // trackingMode also cross-store (animationSettings.trail); host overrides it.
    { id: "trails-track", label: "Track", type: "segmented", field: "trackingMode", options: TRAILS_TRACK_OPTS, tier: "tracking" },
  ],
  fire: [
    slider("fire", "colorBlend", "Color", { tier: "primary" }),
    slider("fire", "intensity", "Intensity", { min: 0.45, max: 1, tier: "primary" }),
    slider("fire", "brightness", "Brightness", { tier: "primary" }),
    slider("fire", "turbulence", "Turbulence", { tier: "primary" }),
    // propColors is a [PropFlameColor, PropFlameColor] pair with a hex↔flame
    // conversion + colorBlend side-effect — host passes cross-store overrides
    // for these two pseudo-fields (fireLeftHex/fireRightHex).
    { id: "fire-color", label: "Colors", type: "colorPair", field: "fireLeftHex", pairFields: ["fireLeftHex", "fireRightHex"], tier: "primary" },
  ],
  // LED v2 is a device + strip pattern + look, none of which is a flat scalar
  // field this manifest can address. Its controls live in the dedicated
  // customize panel instead (Phase 4 rebuild).
  led: [],
  charcoal: [
    slider("charcoal", "intensity", "Intensity", { step: 0.02, tier: "primary" }),
    slider("charcoal", "spread", "Spread", { step: 0.02, tier: "primary" }),
    slider("charcoal", "glow", "Glow", { step: 0.02, tier: "primary" }),
  ],
  zap: [
    { id: "zap-color", label: "Color", type: "colorPair", field: "leftColor", pairFields: ["leftColor", "rightColor"], tier: "primary" },
    slider("zap", "intensity", "Intensity", { tier: "primary" }),
    { id: "zap-style", label: "Style", type: "segmented", field: "style", tier: "primary", options: [
      { value: "branching", label: "Storm" }, { value: "plasma", label: "Plasma" }, { value: "web", label: "Web" },
    ] },
    slider("zap", "frequency", "Frequency", { min: 1, max: 30, step: 1, pct: false, tier: "primary" }),
    slider("zap", "branching", "Branching", { tier: "advanced", showWhen: (i) => i.style === "branching" }),
    slider("zap", "wobbleRate", "Wobble Rate", { tier: "advanced", showWhen: (i) => i.style === "plasma" }),
    slider("zap", "wobbleAmount", "Wobble Amount", { tier: "advanced", showWhen: (i) => i.style === "plasma" }),
    slider("zap", "glow", "Glow", { tier: "advanced" }),
    slider("zap", "jitter", "Jitter", { tier: "advanced" }),
  ],
  sparkles: [
    { id: "sparkles-colormode", label: "Color", type: "segmented", field: "colorMode", tier: "primary", options: [
      { value: "solid", label: "Solid" }, { value: "rainbow", label: "Rainbow" }, { value: "palette", label: "Palette" },
    ] },
    slider("sparkles", "rate", "Rate", { tier: "primary" }),
    { id: "sparkles-mode", label: "Mode", type: "segmented", field: "mode", tier: "primary", options: [
      { value: "burst", label: "Burst" }, { value: "stream", label: "Stream" }, { value: "trail", label: "Trail" },
    ] },
    slider("sparkles", "size", "Size", { tier: "primary" }),
    { id: "sparkles-tint", label: "Tint", type: "color", field: "color", tier: "advanced", showWhen: (i) => i.colorMode === "solid" },
    { id: "sparkles-palette", label: "Palette", type: "paletteSwatches", field: "palette", tier: "advanced", showWhen: (i) => i.colorMode === "palette" },
    slider("sparkles", "lifetime", "Lifetime", { min: 0.1, max: 3, step: 0.1, pct: false, tier: "advanced" }),
    slider("sparkles", "spread", "Spread", { min: 0, max: 30, step: 1, pct: false, tier: "advanced" }),
    slider("sparkles", "gravity", "Gravity", { tier: "advanced" }),
  ],
  ghost: [
    { id: "ghost-color", label: "Colors", type: "colorPair", field: "leftColor", pairFields: ["leftColor", "rightColor"], tier: "primary" },
    slider("ghost", "intensity", "Intensity", { tier: "primary" }),
    slider("ghost", "decay", "Persistence", { min: 1, max: 10, step: 0.5, pct: false, tier: "primary" }),
    slider("ghost", "interval", "Density", { tier: "primary" }),
  ],
  bloom: [
    { id: "bloom-colormode", label: "Color", type: "segmented", field: "colorMode", tier: "primary", options: [
      { value: "solid", label: "Solid" }, { value: "prop-matched", label: "Prop" }, { value: "rainbow", label: "Rainbow" }, { value: "palette", label: "Palette" },
    ] },
    slider("bloom", "intensity", "Intensity", { tier: "primary" }),
    slider("bloom", "radius", "Radius", { min: 8, max: 200, step: 2, pct: false, tier: "primary" }),
    slider("bloom", "coreStrength", "Core", { tier: "advanced" }),
    { id: "bloom-falloff", label: "Falloff", type: "segmented", field: "falloff", tier: "primary", options: [
      { value: "smooth", label: "Smooth" }, { value: "sharp", label: "Sharp" },
    ] },
    { id: "bloom-tint", label: "Tint", type: "color", field: "color", tier: "advanced", showWhen: (i) => i.colorMode === "solid" },
    { id: "bloom-palette", label: "Palette", type: "paletteSwatches", field: "palette", tier: "advanced", showWhen: (i) => i.colorMode === "palette" },
    slider("bloom", "pulse", "Pulse", { tier: "advanced" }),
    slider("bloom", "pulseRate", "Rate", { min: 0.25, max: 4, step: 0.25, pct: false, tier: "advanced" }),
    slider("bloom", "streak", "Streak", { tier: "advanced", compact: false }),
    slider("bloom", "spikes", "Spikes", { tier: "advanced", compact: false }),
    slider("bloom", "afterglow", "Afterglow", { tier: "advanced", compact: false }),
  ],
  goo: [
    ...paletteColor("goo", [
      { value: "classic", label: "Classic" }, { value: "mercury", label: "Mercury" }, { value: "acid", label: "Acid" },
      { value: "blood", label: "Blood" }, { value: "spirit", label: "Spirit" }, { value: "custom", label: "Custom" },
    ]),
    slider("goo", "intensity", "Intensity", { tier: "primary" }),
    // This list feeds the 2D panels and the 3D viewer, but the two goo
    // renderers read different fields (see GooIntent). Ambient only changes
    // the 3D viewer; the 2D canvas ignores it. Viscosity (surfaceTension) is
    // the reverse: it sets the 2D drip rate, body length and taper, 3D ignores
    // it, and it is not listed here, so these surfaces can change it only by
    // picking a look. clarity (3D-only opacity) and spewStyle (read by
    // nothing) are not listed either.
    slider("goo", "ambientEmission", "Ambient", { tier: "primary" }),
    slider("goo", "motionEmission", "Motion", { tier: "primary" }),
    { id: "goo-track", label: "Track", type: "segmented", field: "trackingMode", options: TRACK_OPTS, tier: "tracking" },
  ],
  bubbles: [
    ...paletteColor("bubbles", [
      { value: "soap", label: "Soap" }, { value: "champagne", label: "Bubbly" }, { value: "oil", label: "Oil" },
      { value: "acid", label: "Acid" }, { value: "spirit", label: "Spirit" }, { value: "custom", label: "Custom" },
    ]),
    slider("bubbles", "intensity", "Size", { tier: "primary" }),
    slider("bubbles", "ambientEmission", "Ambient", { tier: "primary" }),
    slider("bubbles", "motionEmission", "Motion", { tier: "primary" }),
    { id: "bubbles-track", label: "Track", type: "segmented", field: "trackingMode", options: TRACK_OPTS, tier: "tracking" },
    slider("bubbles", "sizeJitter", "Jitter", { tier: "advanced" }),
    slider("bubbles", "buoyancy", "Rise", { tier: "advanced" }),
  ],
  petals: [
    ...paletteColor("petals", [
      { value: "blossom", label: "Blossom" }, { value: "autumn", label: "Autumn" }, { value: "jungle", label: "Jungle" },
      { value: "ash", label: "Ash" }, { value: "gold", label: "Gold" }, { value: "custom", label: "Custom" },
    ]),
    slider("petals", "intensity", "Size", { tier: "primary" }),
    slider("petals", "ambientEmission", "Ambient", { tier: "primary" }),
    slider("petals", "motionEmission", "Motion", { tier: "primary" }),
    { id: "petals-track", label: "Track", type: "segmented", field: "trackingMode", options: TRACK_OPTS, tier: "tracking" },
    slider("petals", "carry", "Carry", { tier: "advanced" }),
    slider("petals", "streakLength", "Streak", { tier: "advanced" }),
    slider("petals", "fallSpeed", "Fall", { tier: "advanced" }),
  ],
  smoke: [
    ...paletteColor("smoke", [
      { value: "incense", label: "Incense" }, { value: "fog", label: "Fog" }, { value: "genie", label: "Genie" },
      { value: "cursed", label: "Cursed" }, { value: "spirit", label: "Spirit" }, { value: "campfire", label: "Fire smoke" }, { value: "custom", label: "Custom" },
    ]),
    slider("smoke", "intensity", "Intensity", { tier: "primary" }),
    slider("smoke", "ambientEmission", "Ambient", { tier: "primary" }),
    slider("smoke", "motionEmission", "Motion", { tier: "primary" }),
    { id: "smoke-track", label: "Track", type: "segmented", field: "trackingMode", options: TRACK_OPTS, tier: "tracking" },
    slider("smoke", "curlStrength", "Curl", { tier: "advanced" }),
    slider("smoke", "riseSpeed", "Rise", { tier: "advanced" }),
  ],
  ink: [
    ...paletteColor("ink", [
      { value: "india", label: "India" }, { value: "sumi", label: "Sumi" }, { value: "watercolor", label: "Water" },
      { value: "neon", label: "Neon" }, { value: "blood", label: "Blood" }, { value: "acid", label: "Acid" }, { value: "custom", label: "Custom" },
    ]),
    slider("ink", "intensity", "Intensity", { tier: "primary" }),
    slider("ink", "ambientEmission", "Ambient", { tier: "primary" }),
    slider("ink", "motionEmission", "Motion", { tier: "primary" }),
    { id: "ink-track", label: "Track", type: "segmented", field: "trackingMode", options: TRACK_OPTS, tier: "tracking" },
    slider("ink", "viscosity", "Viscosity", { tier: "advanced" }),
    slider("ink", "splatterIntensity", "Splatter", { tier: "advanced" }),
  ],
  frost: [
    ...paletteColor("frost", [
      { value: "glacial", label: "Glacial" }, { value: "breath", label: "Breath" }, { value: "black_ice", label: "Black Ice" },
      { value: "aurora", label: "Aurora" }, { value: "diamond", label: "Diamond" }, { value: "cursed", label: "Cursed" }, { value: "custom", label: "Custom" },
    ]),
    slider("frost", "intensity", "Intensity", { tier: "primary" }),
    slider("frost", "ambientEmission", "Ambient", { tier: "primary" }),
    slider("frost", "motionEmission", "Motion", { tier: "primary" }),
    { id: "frost-track", label: "Track", type: "segmented", field: "trackingMode", options: TRACK_OPTS, tier: "tracking" },
    slider("frost", "crystallinity", "Crystals", { tier: "advanced" }),
    slider("frost", "spreadRate", "Spread", { tier: "advanced" }),
  ],
  silk: [
    ...paletteColor("silk", [
      { value: "satin", label: "Satin" }, { value: "velvet", label: "Velvet" }, { value: "ethereal", label: "Ethereal" },
      { value: "shadow", label: "Shadow" }, { value: "gold_leaf", label: "Gold" }, { value: "ember", label: "Ember" }, { value: "custom", label: "Custom" },
    ]),
    slider("silk", "intensity", "Intensity", { max: SILK_INTENSITY_MAX, tier: "primary" }),
    slider("silk", "width", "Width", { tier: "primary" }),
    slider("silk", "flutter", "Flutter", { tier: "primary" }),
    { id: "silk-track", label: "Track", type: "segmented", field: "trackingMode", options: TRACK_OPTS, tier: "tracking" },
    slider("silk", "duration", "Duration", { tier: "advanced" }),
    slider("silk", "tautness", "Tautness", { tier: "advanced" }),
  ],
  animal: [
    ...paletteColor("animal", [
      { value: "satin", label: "Satin" }, { value: "velvet", label: "Velvet" }, { value: "ethereal", label: "Ethereal" },
      { value: "shadow", label: "Shadow" }, { value: "gold_leaf", label: "Gold Leaf" }, { value: "ember", label: "Ember" },
    ]),
    { id: "animal-creature", label: "Creature", type: "segmented", field: "creature", tier: "primary", options: [
      { value: "snake", label: "Snake" }, { value: "dragon", label: "Dragon" }, { value: "caterpillar", label: "Caterpillar" },
    ] },
    slider("animal", "intensity", "Intensity", { tier: "primary" }),
    slider("animal", "width", "Width", { tier: "primary" }),
    { id: "animal-track", label: "Track", type: "segmented", field: "trackingMode", options: TRACK_OPTS, tier: "tracking" },
    slider("animal", "bodyLength", "Length", { tier: "advanced" }),
    slider("animal", "slither", "Slither", { tier: "advanced" }),
  ],
  pulse: [
    ...paletteColor("pulse", [
      { value: "sonar", label: "Sonar" }, { value: "ripple", label: "Ripple" }, { value: "aurora", label: "Aurora" },
      { value: "neon", label: "Neon" }, { value: "ember", label: "Ember" }, { value: "void", label: "Void" }, { value: "custom", label: "Custom" },
    ]),
    { id: "pulse-colormode", label: "Color", type: "segmented", field: "colorMode", tier: "primary", options: [
      { value: "solid", label: "Solid" }, { value: "prop-matched", label: "Prop" }, { value: "rainbow", label: "Rainbow" }, { value: "palette", label: "Palette" },
    ] },
    { id: "pulse-tint-solid", label: "Tint", type: "color", field: "color", tier: "advanced", showWhen: (i) => i.colorMode === "solid" },
    slider("pulse", "intensity", "Intensity", { tier: "primary" }),
    { id: "pulse-trigger", label: "Trigger", type: "segmented", field: "trigger", tier: "primary", options: [
      { value: "beat", label: "Beat" }, { value: "velocity", label: "Velocity" }, { value: "continuous", label: "Steady" },
    ] },
    slider("pulse", "beatInterval", "Beat", { min: 1, max: 8, step: 1, pct: false, tier: "primary", showWhen: (i) => i.trigger === "beat" }),
    slider("pulse", "velocityThreshold", "Threshold", { tier: "primary", showWhen: (i) => i.trigger === "velocity" }),
    slider("pulse", "reach", "Reach", { tier: "primary" }),
    { id: "pulse-track", label: "Track", type: "segmented", field: "trackingMode", options: TRACK_OPTS, tier: "tracking" },
    { id: "pulse-style", label: "Style", type: "segmented", field: "style", tier: "advanced", options: [
      { value: "stroke", label: "Stroke" }, { value: "glow", label: "Glow" },
    ] },
    slider("pulse", "lifetime", "Lifetime", { min: 0.2, max: 3, step: 0.1, pct: false, tier: "advanced" }),
    slider("pulse", "thickness", "Thickness", { tier: "advanced" }),
    slider("pulse", "velocityScale", "Velocity", { tier: "advanced", compact: false }),
    slider("pulse", "asymmetry", "Asymmetry", { tier: "advanced", compact: false }),
    slider("pulse", "chromatic", "Chromatic", { tier: "advanced", compact: false }),
    slider("pulse", "flash", "Flash", { tier: "advanced", compact: false }),
    slider("pulse", "harmonics", "Harmonics", { tier: "advanced", compact: false }),
  ],
};

export function primaryControls(effect: EffectId): ControlDescriptor[] {
  return EFFECT_CONTROLS[effect].filter((c) => c.tier === "primary" || c.tier === "tracking");
}
export function advancedControls(effect: EffectId): ControlDescriptor[] {
  return EFFECT_CONTROLS[effect].filter((c) => c.tier === "advanced");
}
