/**
 * Charcoal effect presets.
 *
 * Each preset sets the CharcoalIntent including semantic values and optional
 * custom colors. The renderer derives CharcoalSparkParams from these via
 * semanticToCharcoalParams, passing color overrides if present.
 *
 * Colors are RGB 0-255 (the renderer normalizes to 0-1 for GPU).
 *
 * Every preset sets `emissionStyle`. A preset that leaves it out keeps the
 * previous preset's emission, so Hot Coal picked after Cinder Fan drew a fan.
 */

import type { EffectPreset, EffectPresetGroup } from "./types";

export const CHARCOAL_PRESETS: EffectPreset<"charcoal">[] = [
  {
    id: "charcoal-steel-wool",
    name: "Steel Wool",
    previewColor: "#fff1c7",
    patch: {
      intensity: 0.98,
      spread: 0.14,
      glow: 0.96,
      emissionStyle: "steel-wool",
      coreColor: [255, 252, 232],
      midColor: [255, 178, 78],
      coolColor: [125, 24, 4],
    },
  },
  {
    id: "charcoal-forge-cinder",
    name: "Forge Burst",
    previewColor: "#ff7a1a",
    // Spread 0.30, not 0.42. A burst is punchy and close - at 0.42 it sat
    // between Steel Wool and Cinder Fan without being either, and measured
    // within 10 RGB of both. Tightening it gives the set a hot mid-spread look
    // that is about shape rather than volume.
    patch: {
      intensity: 0.9,
      spread: 0.3,
      glow: 0.8,
      emissionStyle: "forge-burst",
      coreColor: [255, 238, 190],
      midColor: [255, 102, 20],
      coolColor: [138, 18, 0],
    },
  },
  {
    id: "charcoal-cinder-fan",
    name: "Cinder Fan",
    previewColor: "#ff4930",
    patch: {
      intensity: 1,
      spread: 1,
      glow: 0.68,
      emissionStyle: "cinder-fan",
      coreColor: [255, 230, 174],
      midColor: [255, 72, 20],
      coolColor: [112, 8, 2],
    },
  },
  {
    id: "charcoal-banked-ember",
    name: "Banked Ember",
    previewColor: "#d83b16",
    // A banked fire is one damped down for the night, so this is the set's
    // quiet warm anchor: intensity 0.34, not 0.62. Six of the eight presets
    // used to sit at intensity >= 0.5, which left the low end of the range
    // represented only by Ash.
    patch: {
      intensity: 0.34,
      spread: 0.25,
      glow: 0.62,
      emissionStyle: "banked-ember",
      coreColor: [255, 210, 142],
      midColor: [214, 52, 14],
      coolColor: [72, 6, 2],
    },
  },
  {
    id: "charcoal-violet-ember",
    name: "Violet Ember",
    previewColor: "#a855f7",
    patch: {
      intensity: 0.5,
      spread: 0.5,
      glow: 0.6,
      emissionStyle: "steel-wool",
      coreColor: [230, 180, 255], // bright lavender
      midColor: [160, 60, 220], // violet
      coolColor: [80, 10, 120], // deep purple
    },
  },
  {
    id: "charcoal-hot-coal",
    name: "Hot Coal",
    previewColor: "#ef4444",
    // Was 0.88/0.88/0.8, which measured within 3/255 of Cinder Fan's mean hue
    // at 98% coverage - two slots doing one job, the louder of which was this
    // one. A hot coal is a FEW heavy embers that hang, so intensity drops hard
    // and glow rises: sparse, fat, slow, against Cinder Fan's many-and-fine.
    // Intensity has to go this low because glow widens every ember's halo, so
    // 0.4/0.92 measured BUSIER than the fan it was meant to differ from.
    patch: {
      intensity: 0.24,
      spread: 0.85,
      glow: 0.85,
      emissionStyle: "steel-wool",
      coreColor: [255, 240, 200],
      midColor: [255, 80, 20],
      coolColor: [180, 20, 0],
    },
  },
  {
    id: "charcoal-jade-dust",
    name: "Jade Dust",
    previewColor: "#34d399",
    patch: {
      intensity: 0.4,
      spread: 0.7,
      glow: 0.5,
      emissionStyle: "steel-wool",
      coreColor: [200, 255, 220], // bright mint
      midColor: [40, 200, 120], // emerald
      coolColor: [10, 90, 50], // dark green
    },
  },
  {
    id: "charcoal-ash",
    name: "Ash",
    previewColor: "#9ca3af",
    // Ash drifts, it does not fall: spread 0.55, not 0.3. At 0.3/0.3/0.2 it
    // measured 5.5% lit - not subtle, just absent. Glow 0.3 keeps it the
    // faintest look in the set while leaving something to see.
    patch: {
      intensity: 0.3,
      spread: 0.55,
      glow: 0.3,
      emissionStyle: "steel-wool",
      coreColor: [220, 220, 230], // near-white
      midColor: [140, 140, 155], // medium gray
      coolColor: [60, 60, 70], // dark gray
    },
  },
];

export const CHARCOAL_PRESET_GROUP: EffectPresetGroup = {
  effectType: "charcoal",
  presets: CHARCOAL_PRESETS,
  getSummary: (state): string => {
    const i = Math.round(state.charcoal.intensity * 100);
    const s = Math.round(state.charcoal.spread * 100);
    const g = Math.round(state.charcoal.glow * 100);
    return `Intensity ${i}% · Spread ${s}% · Glow ${g}%`;
  },
};
