import type { EffectPreset, EffectPresetGroup } from "./types";

export const ZAP_PRESETS: EffectPreset<"zap">[] = [
  {
    id: "zap-storm",
    name: "Storm",
    previewColor: "#88ccff",
    patch: {
      intensity: 0.9, leftColor: "#88ccff", rightColor: "#a25bff",
      frequency: 10, branching: 0.5, style: "branching", mode: "arc",
      // Storm and Web set Tesla's four fields to their factory values; left
      // out, a look picked after Tesla kept Tesla's glow and jitter.
      wobbleRate: 0.18, wobbleAmount: 0.5, glow: 0.5, jitter: 0.5,
    },
  },
  {
    id: "zap-tesla",
    name: "Tesla",
    previewColor: "#a855f7",
    patch: {
      intensity: 1.0, leftColor: "#c084fc", rightColor: "#7c3aed",
      frequency: 18, branching: 0.4, style: "plasma", mode: "arc",
      wobbleRate: 0.16, wobbleAmount: 0.55, glow: 0.6, jitter: 0.35,
    },
  },
  {
    id: "zap-web",
    name: "Web",
    previewColor: "#22d3ee",
    previewColor2: "#9d7bff",
    patch: {
      intensity: 0.8, leftColor: "#22d3ee", rightColor: "#ec4899",
      frequency: 12, branching: 0.2, style: "web", mode: "arc",
      wobbleRate: 0.18, wobbleAmount: 0.5, glow: 0.5, jitter: 0.5,
    },
  },
];

export const ZAP_PRESET_GROUP: EffectPresetGroup = {
  effectType: "zap",
  presets: ZAP_PRESETS,
  getSummary: (state) => {
    const z = state.zap;
    const label = z.style === "branching" ? "storm" : z.style;
    return `${label} · freq ${z.frequency}/s · ${Math.round(z.intensity * 100)}%`;
  },
};
