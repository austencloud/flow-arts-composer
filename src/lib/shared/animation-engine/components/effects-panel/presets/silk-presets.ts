import type { EffectPreset, EffectPresetGroup } from "./types";
import { SILK_INTENSITY_DEFAULT, SILK_INTENSITY_MAX } from "#lib/shared/effects/domain/effects-config.js";

export const SILK_PRESETS: EffectPreset<"silk">[] = [
  {
    id: "silk-classic",
    name: "Classic",
    previewColor: "#c0c0d0",
    patch: {
      palette: "satin",
      intensity: SILK_INTENSITY_DEFAULT,
      width: 0.5,
      duration: 0.5,
      flutter: 0.3,
      tautness: 0.5,
      trackingMode: "both_ends",
    },
  },
  {
    id: "silk-streamer",
    name: "Streamer",
    previewColor: "#c080ff",
    patch: {
      palette: "ethereal",
      intensity: 0.55,
      width: 0.7,
      duration: 0.8,
      flutter: 0.7,
      tautness: 0.3,
      trackingMode: "both_ends",
    },
  },
  {
    id: "silk-whip",
    name: "Whip",
    previewColor: "#202830",
    patch: {
      palette: "shadow",
      intensity: 0.6,
      width: 0.4,
      duration: 0.3,
      flutter: 0.1,
      tautness: 0.9,
      trackingMode: "both_ends",
    },
  },
  {
    id: "silk-royal",
    name: "Royal",
    previewColor: "#ffd700",
    patch: {
      palette: "gold_leaf",
      intensity: 0.6,
      width: 0.7,
      duration: 0.6,
      flutter: 0.2,
      tautness: 0.4,
      trackingMode: "both_ends",
    },
  },
  {
    id: "silk-inferno",
    name: "Inferno",
    previewColor: "#ff6000",
    patch: {
      palette: "ember",
      intensity: SILK_INTENSITY_MAX,
      width: 0.5,
      duration: 0.5,
      flutter: 0.4,
      tautness: 0.7,
      trackingMode: "both_ends",
    },
  },
  {
    id: "silk-phantom",
    name: "Phantom",
    previewColor: "#101020",
    patch: {
      palette: "shadow",
      intensity: 0.3,
      width: 0.6,
      duration: 0.9,
      flutter: 0.5,
      tautness: 0.2,
      trackingMode: "both_ends",
    },
  },
];

export const SILK_PRESET_GROUP: EffectPresetGroup = {
  effectType: "silk",
  presets: SILK_PRESETS,
  getSummary: (state) => {
    const s = state.silk;
    return `${s.palette} · width ${Math.round(s.width * 100)}% · taut ${Math.round(s.tautness * 100)}%`;
  },
};
