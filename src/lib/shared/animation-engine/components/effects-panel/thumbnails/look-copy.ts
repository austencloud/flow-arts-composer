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

  // Zap
  "zap-storm": "Forking bolts, ghost strikes",
  "zap-tesla": "One clean arc, wide halo",
  "zap-web": "Fine crackle between the tips",

  // Sparkle
  "sparkles-fairy-dust": "Soft gold motes drifting down",
  "sparkles-confetti": "Bright flecks in many colors",
  "sparkles-prism": "Sharp white glints",
  "sparkles-starfall": "Long-armed stars falling",
  "sparkles-glitter": "Dense tiny glints on the path",
  "sparkles-aurora": "Glints shifting through the rainbow",

  // Goo
  "goo-classic": "Green rope with hanging drips",
  "goo-fountain": "Oozing body, many drips",
  "goo-whip": "Thin fast rope, few drips",
  "goo-mercury": "Bright chrome liquid",
  "goo-acid": "Glowing green, dark interior",
  "goo-blood": "Dark red, slow heavy drips",
  "goo-spirit": "Pale translucent ooze",

  // Bubbles
  "bubbles-classic": "Clear bubbles rising",
  "bubbles-fizz": "Many small bubbles",
  "bubbles-dream": "Few big slow bubbles",
  "bubbles-iridescent": "Oil-sheen rims",
  "bubbles-acid": "Green-lit bubbles",
  "bubbles-spirit": "Faint pale bubbles",

  // Petals
  "petals-classic": "Pink blossoms on the breeze",
  "petals-storm": "Autumn leaves thrown wide",
  "petals-jungle": "Big green leaves",
  "petals-ember": "Charred flakes, ember rims",
  "petals-gilded": "Gold leaves drifting",
  "petals-tornado": "Leaves whipped into a spiral",

  // Smoke
  "smoke-classic": "Grey plume rising",
  "smoke-fog-wall": "Low heavy blanket",
  "smoke-genie-burst": "Tall fast column",
  "smoke-cursed": "Black smoke on a lit ground",
  "smoke-spirit-veil": "Thin pale veil",
  "smoke-campfire": "Warm slow plume",

  // Ink
  "ink-toxic": "Green swash shattering to drops",
  "ink-neon-tag": "Glowing additive stroke",
  "ink-splatter": "Dark red swash with chips",

  // Silk
  "silk-classic": "Satin ribbon in the hand color",
  "silk-streamer": "Long light streamer",
  "silk-whip": "Short taut cloth on a lit ground",
  "silk-royal": "Deep velvet, gold sheen",
  "silk-inferno": "Ember cloth with an aura",
  "silk-phantom": "Shadow ribbon on a lit ground",

  // Animal
  "animal-wisp": "Pale ethereal snake",
  "animal-whisper": "Shadow snake on a lit ground",
  "animal-serpent": "Velvet serpent, long coil",
  "animal-ember-drake": "Glowing dragon with whiskers",
  "animal-gilt-wyrm": "Gold dragon, longest coil",
  "animal-inchworm": "Plump caterpillar with legs",

  // Pulse
  "pulse-sonar": "Blue rings on the beat",
  "pulse-shockwave": "Orange bang at the swing peak",
  "pulse-heartbeat": "Tight double ring, charging",
  "pulse-ripple": "Stream of small rings",
};

/** Null when a look has no copy yet, so the caller can fall back to its trait. */
export function describeLook(presetId: string): string | null {
  return LOOK_DESCRIPTIONS[presetId] ?? null;
}
