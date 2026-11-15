/**
 * The practice ramp presets. Creep climbs +1 BPM every loop; Staircase holds
 * five loops at each speed, then jumps +5 BPM. Any other shape is Custom.
 */

import type { TempoPracticeConfig } from "../services/tempo-practice-orchestrator";

export type RampPresetId = "creep" | "staircase" | "custom";

export const RAMP_PRESET_PATCHES: Record<
  Exclude<RampPresetId, "custom">,
  Pick<TempoPracticeConfig, "increment" | "roundsPerLevel">
> = {
  creep: { increment: 1, roundsPerLevel: 1 },
  staircase: { increment: 5, roundsPerLevel: 5 },
};

/** Which preset a saved config matches (defaults read as Creep). */
export function matchRampPreset(
  config: Partial<TempoPracticeConfig>
): RampPresetId {
  const increment = config.increment ?? 1;
  const rounds = config.roundsPerLevel ?? 1;
  if (increment === 1 && rounds === 1) return "creep";
  if (increment === 5 && rounds === 5) return "staircase";
  return "custom";
}
