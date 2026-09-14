/**
 * The card badge describes what is drawn, not the generation setting that
 * happened to produce it. Keep this deliberately small so the app and both
 * MCP adapters can supply their own motion models.
 */
export type DifficultyTrigger = "none" | "turns" | "nonRadial";

export interface DifficultyAnalysis {
  readonly level: 1 | 2 | 3;
  readonly trigger: DifficultyTrigger;
}

export interface DifficultyMotion {
  readonly turns?: number | "fl" | null;
  readonly startOrientation?: string | null;
  readonly endOrientation?: string | null;
}

export function analyzeDifficultyMotions(
  motions: Iterable<DifficultyMotion | null | undefined>
): DifficultyAnalysis {
  let hasTurns = false;

  for (const motion of motions) {
    if (!motion) continue;
    if (
      isNonRadial(motion.startOrientation) ||
      isNonRadial(motion.endOrientation)
    ) {
      return { level: 3, trigger: "nonRadial" };
    }
    if (hasMotionTurns(motion)) hasTurns = true;
  }

  return hasTurns
    ? { level: 2, trigger: "turns" }
    : { level: 1, trigger: "none" };
}

export function calculateDifficultyLevelFromMotions(
  motions: Iterable<DifficultyMotion | null | undefined>
): 1 | 2 | 3 {
  return analyzeDifficultyMotions(motions).level;
}

function isNonRadial(orientation: string | null | undefined): boolean {
  const normalized = orientation?.toLowerCase();
  return normalized === "clock" || normalized === "counter";
}

function hasMotionTurns(motion: DifficultyMotion): boolean {
  return (
    motion.turns === "fl" ||
    (typeof motion.turns === "number" && motion.turns > 0)
  );
}
