/**
 * Saved places in the Hand Motions lesson. Schema 4 (2026-10-12) is the four
 * stages: the book's chart of the three motions, motion map, two hands,
 * wrap-up. Older saves (the hand-path carousel's schemas 1 and 2, and schema
 * 3, which began at the map) point at stages that have moved, so they restart
 * at stage 1.
 */
export const HAND_MOTIONS_STAGE_SCHEMA_VERSION = 4;
export const HAND_MOTIONS_STAGE_COUNT = 4;

export function migrateHandMotionsSavedStep(
  savedStep: number,
  savedSchemaVersion: number
): number {
  if (savedSchemaVersion < HAND_MOTIONS_STAGE_SCHEMA_VERSION) return 1;
  return Math.min(HAND_MOTIONS_STAGE_COUNT, Math.max(1, savedStep || 1));
}
