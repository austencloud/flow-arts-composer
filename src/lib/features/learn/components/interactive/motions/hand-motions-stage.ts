/**
 * Saved places in the Hand Motions lesson. Schema 3 (2026-10) is the three
 * stages: motion map, two hands, wrap-up. Saves from the hand-path carousel
 * (schemas 1 and 2) point at stages that no longer exist, so they restart at
 * stage 1.
 */
export const HAND_MOTIONS_STAGE_SCHEMA_VERSION = 3;
export const HAND_MOTIONS_STAGE_COUNT = 3;

export function migrateHandMotionsSavedStep(
  savedStep: number,
  savedSchemaVersion: number
): number {
  if (savedSchemaVersion < HAND_MOTIONS_STAGE_SCHEMA_VERSION) return 1;
  return Math.min(HAND_MOTIONS_STAGE_COUNT, Math.max(1, savedStep || 1));
}
