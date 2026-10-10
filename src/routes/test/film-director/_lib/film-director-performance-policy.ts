import { QualityTier } from "#lib/shared/3d/effects/types.js";

/**
 * A close trio can spend its budget on dense effects. Once the cast becomes a
 * crowd, the same per-performer budget would multiply into tens of thousands
 * of particles before the first frame appears.
 */
export function resolveFilmDirectorEffectQualityTier(
  performerCount: number
): QualityTier {
  if (performerCount >= 6) return QualityTier.LOW;
  if (performerCount >= 4) return QualityTier.MEDIUM;
  return QualityTier.HIGH;
}

export function resolveDirectorPerformerPoolSize(
  directedPerformerCount: number,
  reservedPerformerCount?: number
): number {
  return Math.max(directedPerformerCount, reservedPerformerCount ?? 0);
}
