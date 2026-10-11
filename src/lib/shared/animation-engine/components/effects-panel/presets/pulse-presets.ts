import type { EffectPreset, EffectPresetGroup } from "./types";

export const PULSE_PRESETS: EffectPreset<"pulse">[] = [
  {
    // Pure concentric circles — no momentum, the clean radar ping.
    id: "pulse-sonar",
    name: "Sonar",
    previewColor: "#38bdf8",
    patch: {
      trigger: "beat",
      style: "glow",
      palette: "sonar",
      colorMode: "solid",
      intensity: 0.7,
      reach: 0.7,
      lifetime: 1.1,
      thickness: 0.3,
      beatInterval: 1,
      velocityScale: 0.3,
      asymmetry: 0,
      chromatic: 0,
      flash: 0.3,
      harmonics: 0.15,
      charge: 0.5,
    },
  },
  {
    // Headline: a ring at the fastest point of each swing, thrown forward
    // with a burning leading edge, chromatic fringe and a hard flash.
    id: "pulse-shockwave",
    name: "Shockwave",
    previewColor: "#ff6000",
    patch: {
      trigger: "velocity",
      style: "glow",
      palette: "ember",
      colorMode: "solid",
      intensity: 0.6,
      reach: 0.5,
      lifetime: 1.3,
      thickness: 1.0,
      velocityThreshold: 0.55,
      velocityScale: 1.0,
      asymmetry: 0.4,
      chromatic: 0.4,
      flash: 1.0,
      harmonics: 0.25,
      charge: 0.6,
    },
  },
  {
    // Beat-locked paired thump (lub-dub on each beat, gaps between) — the
    // rhythmic identity, distinct from Ripple's continuous flow.
    id: "pulse-heartbeat",
    name: "Heartbeat",
    previewColor: "#f0abfc",
    patch: {
      trigger: "beat",
      style: "glow",
      palette: "neon",
      colorMode: "solid",
      intensity: 0.42,
      reach: 0.45,
      lifetime: 0.8,
      thickness: 0.45,
      beatInterval: 1,
      velocityScale: 0.5,
      asymmetry: 0.15,
      chromatic: 0.1,
      flash: 0.6,
      harmonics: 0.4,
      charge: 0.85,
    },
  },
  {
    // Soft continuous many-ring concentric flow — large, slow, no flash, no
    // momentum. Pure water, distinct from Heartbeat's punchy beat thump.
    id: "pulse-ripple",
    name: "Ripple",
    previewColor: "#93c5fd",
    patch: {
      trigger: "continuous",
      style: "glow",
      palette: "ripple",
      colorMode: "solid",
      intensity: 0.3,
      reach: 0.75,
      lifetime: 1.2,
      thickness: 0.5,
      velocityScale: 0.35,
      asymmetry: 0,
      chromatic: 0,
      flash: 0,
      harmonics: 0.65,
      charge: 0.6,
    },
  },
];

export const PULSE_PRESET_GROUP: EffectPresetGroup = {
  effectType: "pulse",
  presets: PULSE_PRESETS,
  getSummary: (state) => {
    const p = state.pulse;
    return `${p.trigger} · ${p.style} · ${p.palette}`;
  },
};
