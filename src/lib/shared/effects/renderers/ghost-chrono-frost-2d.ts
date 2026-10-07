export interface Ghost2DAgeVisual {
  bodyAlpha: number;
  rimAlpha: number;
  frostAlpha: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Resolve the 2D Chrono-Frost age story without coupling it to canvas state.
 * Fresh exposures retain a glass body, the middle sheds into frost, and the
 * oldest readable phase is carried by the pale rim before everything reaches
 * zero at the persistence boundary.
 */
export function resolveGhost2DAgeVisual(
  ageSeconds: number,
  lifetimeSeconds: number,
  intensity: number
): Ghost2DAgeVisual {
  const age = clamp01(ageSeconds / Math.max(0.001, lifetimeSeconds));
  const strength = clamp01(intensity);
  const remaining = Math.pow(1 - age, 0.72);
  const bodyShedding = smoothstep((age - 0.14) / 0.48);
  const frostPhase = Math.sin(Math.PI * clamp01((age - 0.04) / 0.82));

  return {
    bodyAlpha: 0.54 * strength * (1 - bodyShedding) * Math.pow(1 - age, 1.15),
    rimAlpha: 0.74 * strength * remaining,
    frostAlpha: 0.34 * strength * Math.max(0, frostPhase) * remaining,
  };
}

/** Cold white the frost and rim lean toward as a ghost ages. */
export const GHOST_FROST_WHITE = "#e2f9ff";

/**
 * How far the rim leans toward frost white. The rim is cut from the prop's own
 * sprite, so it keeps the bark, tape and hand colors; this lift only keeps a
 * dark prop's outline readable on a dark stage.
 */
export const GHOST_RIM_FROST_MIX = 0.32;
