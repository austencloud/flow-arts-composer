/**
 * Database Constants
 *
 * Centralized configuration for the TKA database including
 * database name, table names, indexes, and version information.
 */


/**
 * Main database name in IndexedDB
 */
export const DATABASE_NAME = "TKADatabase";

/**
 * Current database schema version
 * Version 2: Added gamification tables (achievements, XP, challenges, streaks, notifications)
 * Version 3: Added weekly challenges and skill progressions
 * Version 4: Added train module tables (performances, calibration profiles)
 * Version 5: Added compositions table for Compose module
 * Version 6: Added galleryCache and galleryCacheMeta tables for offline browse gallery
 * Version 7: Removed the gamification tables (XP/achievement/challenge/streak system
 *            torn out). Dexie drops the object stores omitted from this schema.
 * Version 8: Added generatedMandalaPool — bounded pool of locally-generated
 *            sequences for the in-app MandalaLoader (drop-oldest at cap).
 * Version 9: Added role-bound media composition presets for Post Studio and
 *            Compose.
 * Version 10: Added user-scoped message drafts and the durable message outbox.
 */
export const DATABASE_VERSION = 10;


export const TABLE_NAMES = {
  SEQUENCES: "sequences",
  PICTOGRAPHS: "pictographs",
  USER_WORK: "userWork",
  USER_PROJECTS: "userProjects",
  SETTINGS: "settings",
  // Train module tables (v4)
  TRAIN_PERFORMANCES: "trainPerformances",
  TRAIN_CALIBRATION_PROFILES: "trainCalibrationProfiles",
  // Compose module tables (v5)
  COMPOSITIONS: "compositions",
  // Offline cache tables (v6)
  GALLERY_CACHE: "galleryCache",
  GALLERY_CACHE_META: "galleryCacheMeta",
  // Mandala loader pool (v8)
  GENERATED_MANDALA_POOL: "generatedMandalaPool",
  MEDIA_COMPOSITION_PRESETS: "mediaCompositionPresets",
  MESSAGE_DRAFTS: "messageDrafts",
  MESSAGE_OUTBOX: "messageOutbox",
} as const;


/**
 * Index definitions for each table
 * Format: '++primaryKey, index1, index2, *multiValueIndex'
 */
export const TABLE_INDEXES = {
  [TABLE_NAMES.SEQUENCES]:
    "++id, name, word, author, dateAdded, level, isFavorite, difficultyLevel, *tags",
  [TABLE_NAMES.PICTOGRAPHS]: "++id, letter, startPlacement, endPlacement",
  [TABLE_NAMES.USER_WORK]:
    "++id, type, tabId, [type+tabId], userId, lastModified",
  [TABLE_NAMES.USER_PROJECTS]:
    "++id, name, userId, createdAt, lastModified, isPublic, *tags",
  [TABLE_NAMES.SETTINGS]: "++id, userId",
  // Train module tables (v4)
  [TABLE_NAMES.TRAIN_PERFORMANCES]:
    "++id, sequenceId, performedAt, grade, [sequenceId+performedAt], score.percentage",
  [TABLE_NAMES.TRAIN_CALIBRATION_PROFILES]: "++id, name, createdAt, isDefault",
  // Compose module tables (v5)
  [TABLE_NAMES.COMPOSITIONS]:
    "++id, name, createdAt, updatedAt, creator, isFavorite",
  // Offline cache tables (v6)
  [TABLE_NAMES.GALLERY_CACHE]: "id, data.word, data.ownerId, cachedAt",
  [TABLE_NAMES.GALLERY_CACHE_META]: "id",
  // Mandala loader pool (v8) — id is a supplied uuid, not auto-increment
  [TABLE_NAMES.GENERATED_MANDALA_POOL]: "id, generatedAt",
  [TABLE_NAMES.MEDIA_COMPOSITION_PRESETS]:
    "id, ownerId, updatedAt, createdAt, name",
  [TABLE_NAMES.MESSAGE_DRAFTS]:
    "id, userId, conversationId, [userId+conversationId], updatedAt",
  [TABLE_NAMES.MESSAGE_OUTBOX]:
    "id, userId, conversationId, [userId+conversationId], status, createdAt, updatedAt",
} as const;


/**
 * Default version for new user work data
 */
export const DEFAULT_USER_WORK_VERSION = 1;

/**
 * Default version for new user projects
 */
export const DEFAULT_USER_PROJECT_VERSION = 1;


/**
 * Maximum number of items to return in a single query
 */
export const MAX_QUERY_LIMIT = 1000;

/**
 * Default page size for paginated queries
 */
export const DEFAULT_PAGE_SIZE = 50;
