import type { InkIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export interface InkPresetCandidate {
  id: string;
  name: string;
  description: string;
  accent: string;
  intent: InkIntent;
}

function inkIntent(patch: Partial<InkIntent>): InkIntent {
  return { ...DEFAULT_EFFECTS_CONFIG.ink, ...patch };
}

export const INK_PRESET_CANDIDATES: InkPresetCandidate[] = [
  {
    id: "04",
    name: "Sumi Flow",
    description: "Smoky gray pigment with a restrained wet sheen.",
    accent: "#9a9a9a",
    intent: inkIntent({}),
  },
  {
    id: "05",
    name: "Gloss Black",
    description: "Black pigment with a narrow silver reflection.",
    accent: "#b1b1b1",
    intent: inkIntent({
      palette: "india",
      ambientEmission: 0.06,
      motionEmission: 0.96,
      intensity: 0.74,
      viscosity: 0.42,
      splatterIntensity: 0.1,
    }),
  },
  {
    id: "06",
    name: "Deep Drip",
    description: "Heavy black strokes that shed short, weighty drops.",
    accent: "#777777",
    intent: inkIntent({
      palette: "india",
      ambientEmission: 0.24,
      motionEmission: 0.72,
      intensity: 0.88,
      viscosity: 0.76,
      splatterIntensity: 0.4,
    }),
  },
  {
    id: "07",
    name: "Neon Tag",
    description: "Hot-pink additive pigment with sharp directional flecks.",
    accent: "#ff2080",
    intent: inkIntent({
      palette: "neon",
      ambientEmission: 0.08,
      motionEmission: 1,
      intensity: 0.88,
      viscosity: 0.2,
      splatterIntensity: 0.38,
    }),
  },
  {
    id: "08",
    name: "Blood Splatter",
    description: "Dense red impacts followed by brief outward spray.",
    accent: "#d67881",
    intent: inkIntent({
      palette: "blood",
      ambientEmission: 0.08,
      motionEmission: 0.7,
      intensity: 0.76,
      viscosity: 0.78,
      splatterIntensity: 0.92,
    }),
  },
  {
    id: "09",
    name: "Toxic Flow",
    description: "Acid-green ribbon with lively but controlled breakup.",
    accent: "#9ef064",
    intent: inkIntent({
      palette: "acid",
      ambientEmission: 0.12,
      motionEmission: 0.86,
      intensity: 0.68,
      viscosity: 0.5,
      splatterIntensity: 0.48,
    }),
  },
];
