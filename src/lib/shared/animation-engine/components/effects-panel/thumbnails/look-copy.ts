/**
 * Per-look copy, keyed by preset id across every effect.
 *
 * The generic `preview.trait` describes the effect, not the look, so all four
 * Fire presets rendered as "Live flame · 75% intensity" - four identical lines
 * under four visibly different tiles. Copy lives here so adding an effect is a
 * new block in this map rather than another branch in EffectPresetsSection.
 *
 * Describe the visible result, never the parameter values behind it.
 */
const LOOK_DESCRIPTIONS: Readonly<Record<string, string>> = {
  // Bloom
  "bloom-supernova": "Sharp diffraction flare",
  "bloom-comet": "Long-exposure motion",
  "bloom-halo": "Soft photographic glow",

  // Trails
  "trail-neon": "Thin electric ribbons",
  "trail-ember": "Wide fading coal glow",

  // Fire
  "fire-classic": "Natural orange burn",
  "fire-blue-flame": "Cold gas-blue burn",
  "fire-spirit": "Violet ghost flame",
  "fire-liquid": "Flowing molten body",

  // Coal
  "charcoal-steel-wool": "Dense white-hot shower",
  "charcoal-forge-cinder": "Tight burst of hot sparks",
  "charcoal-cinder-fan": "Wide far-thrown fan",
  "charcoal-banked-ember": "Few embers, short fall",
  "charcoal-violet-ember": "Violet sparks, soft drift",
  "charcoal-hot-coal": "Few fat embers, long hang",
  "charcoal-jade-dust": "Sparse green motes",
  "charcoal-ash": "Faint grey drift",

  // LED
  "led-capsule-classic": "One color per hand",
  "led-capsule-pulse": "Breathing green tips",
  "led-rainbow-pov": "Full-spectrum light disc",
  "led-comet": "One point, drawn long",
};

/** Null when a look has no copy yet, so the caller can fall back to its trait. */
export function describeLook(presetId: string): string | null {
  return LOOK_DESCRIPTIONS[presetId] ?? null;
}
