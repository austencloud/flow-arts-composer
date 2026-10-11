import type { EffectPreset, EffectPresetGroup } from "./types";

// Every look sets all nine tuning fields; one left out keeps whatever the
// previous look set, so picking Storm after Tesla would keep Tesla's glow.
export const ZAP_PRESETS: EffectPreset<"zap">[] = [
  {
    id: "zap-storm",
    name: "Storm",
    previewColor: "#88ccff",
    previewColor2: "#a25bff",
    patch: {
      intensity: 0.95,
      colorMode: "custom",
      leftColor: "#88ccff",
      rightColor: "#a25bff",
      frequency: 11,
      branching: 0.75,
      style: "branching",
      mode: "arc",
      wobbleRate: 0.3,
      wobbleAmount: 0.45,
      glow: 0.6,
      jitter: 0.6,
    },
  },
  {
    id: "zap-tesla",
    name: "Tesla",
    previewColor: "#c084fc",
    previewColor2: "#7c3aed",
    patch: {
      intensity: 1.0,
      colorMode: "custom",
      leftColor: "#c084fc",
      rightColor: "#7c3aed",
      frequency: 8,
      branching: 0.4,
      style: "plasma",
      mode: "arc",
      wobbleRate: 0.4,
      wobbleAmount: 0.55,
      glow: 0.65,
      jitter: 0.5,
    },
  },
  {
    id: "zap-web",
    name: "Web",
    previewColor: "#22d3ee",
    previewColor2: "#ec4899",
    patch: {
      intensity: 0.85,
      colorMode: "custom",
      leftColor: "#22d3ee",
      rightColor: "#ec4899",
      frequency: 10,
      branching: 0.25,
      style: "web",
      mode: "arc",
      wobbleRate: 0.3,
      wobbleAmount: 0.45,
      glow: 0.5,
      jitter: 0.45,
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
