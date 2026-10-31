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

/** The phase-data key the lesson writes its schema version under. */
export const HAND_MOTIONS_SCHEMA_KEY = "stageSchemaVersion";

/**
 * The stages a page can open the lesson on, by name. The Guide's Hand
 * Motions page links each of its sections to one of these.
 */
export const HAND_MOTIONS_STAGES = {
  steps: {
    motions: 1,
    map: 2,
    "two-hands": 3,
    quiz: 4,
  },
  schemaKey: HAND_MOTIONS_SCHEMA_KEY,
  schemaVersion: HAND_MOTIONS_STAGE_SCHEMA_VERSION,
} as const;
