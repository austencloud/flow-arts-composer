/**
 * TKA Database - Dexie Configuration
 *
 * This is your main database configuration using Dexie.js
 * Think of this as your "database schema" - it defines what tables you have
 * and how they're indexed for fast queries.
 */

import type { AppSettings } from "../../settings/domain/app-settings";
import type { PictographData } from "../../pictograph/shared/domain/models/pictograph-data";
import type { SequenceData } from "../../foundation/domain/models/sequence-data";
import Dexie, { type EntityTable } from "dexie";
import type {
  StoredPerformance,
  StoredCalibrationProfile,
} from "#lib/shared/train/domain/train-database-models.js";
import type { Composition } from "#lib/shared/animation-engine/domain/compose-types.js";
import type {
  GalleryCacheEntry,
  GalleryCacheMeta,
} from "#lib/shared/offline/domain/offline-cache-types.js";
import type { GeneratedMandalaEntry } from "#lib/shared/mandala/domain/mandala-pool-types.js";
import {
  DATABASE_NAME,
  DATABASE_VERSION,
  DEFAULT_USER_WORK_VERSION,
  TABLE_INDEXES,
} from "../domain/constants/database_constants";
import type { UserProject } from "../domain/models/user-project";
import type { UserWorkData } from "../domain/models/user-work-data";
import type { MediaCompositionPreset } from "#lib/shared/media-composition/domain/media-composition-preset-schema.js";
import type {
  MessageDraftRecord,
  MessageOutboxRecord,
} from "#lib/shared/inbox/domain/message-delivery-models.js";


/**
 * TKA Database Class
 *
 * This extends Dexie and defines your database structure.
 * Each property represents a "table" in your database.
 */
export class TKADatabase extends Dexie {
  // Define your tables with TypeScript types
  sequences!: EntityTable<SequenceData, "id">;
  pictographs!: EntityTable<PictographData, "id">;
  userWork!: EntityTable<UserWorkData, "id">;
  userProjects!: EntityTable<UserProject, "id">;
  settings!: EntityTable<AppSettings & { id: string }, "id">;

  // Train module tables (v4)
  trainPerformances!: EntityTable<StoredPerformance, "id">;
  trainCalibrationProfiles!: EntityTable<StoredCalibrationProfile, "id">;

  // Compose module tables (v5)
  compositions!: EntityTable<Composition, "id">;

  // Offline cache tables (v6)
  galleryCache!: EntityTable<GalleryCacheEntry, "id">;
  galleryCacheMeta!: EntityTable<GalleryCacheMeta, "id">;

  // Mandala loader pool (v8)
  generatedMandalaPool!: EntityTable<GeneratedMandalaEntry, "id">;

  // Shared Post Studio / Compose layout presets (v9)
  mediaCompositionPresets!: EntityTable<MediaCompositionPreset, "id">;

  // Inbox reliability (v10)
  messageDrafts!: EntityTable<MessageDraftRecord, "id">;
  messageOutbox!: EntityTable<MessageOutboxRecord, "id">;

  constructor() {
    super(DATABASE_NAME);

    // Version 1 schema - this is like a database migration
    this.version(DATABASE_VERSION).stores(TABLE_INDEXES);

    // Optional: Add hooks for automatic timestamps
    this.userWork.hook("creating", function (_primKey, obj, _trans) {
      obj.lastModified = new Date();
      obj.version = obj.version || DEFAULT_USER_WORK_VERSION;
    });

    this.userWork.hook(
      "updating",
      function (modifications, _primKey, _obj, _trans) {
        (modifications as Partial<UserWorkData>).lastModified = new Date();
      }
    );
  }
}


/**
 * Single database instance for your entire app
 * Import this wherever you need database access
 */
export const db = new TKADatabase();


/**
 * Initialize database - call this when your app starts
 */
export async function initializeDatabase(): Promise<void> {
  await db.open();
}

/**
 * Clear all data (useful for development/testing)
 */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.sequences,
      db.pictographs,
      db.userWork,
      db.userProjects,
      db.settings,
      db.trainPerformances,
      db.trainCalibrationProfiles,
      db.compositions,
      db.galleryCache,
      db.galleryCacheMeta,
      db.generatedMandalaPool,
      db.mediaCompositionPresets,
      db.messageDrafts,
      db.messageOutbox,
    ],
    async () => {
      await db.sequences.clear();
      await db.pictographs.clear();
      await db.userWork.clear();
      await db.userProjects.clear();
      await db.settings.clear();
      await db.trainPerformances.clear();
      await db.trainCalibrationProfiles.clear();
      await db.compositions.clear();
      await db.galleryCache.clear();
      await db.galleryCacheMeta.clear();
      await db.generatedMandalaPool.clear();
      await db.mediaCompositionPresets.clear();
      await db.messageDrafts.clear();
      await db.messageOutbox.clear();
    }
  );
}

export async function getDatabaseInfo(): Promise<{
  sequences: number;
  pictographs: number;
  userWork: number;
  userProjects: number;
  settings: number;
  trainPerformances: number;
  trainCalibrationProfiles: number;
  compositions: number;
  galleryCache: number;
  galleryCacheMeta: number;
  generatedMandalaPool: number;
  mediaCompositionPresets: number;
  messageDrafts: number;
  messageOutbox: number;
}> {
  const info = {
    sequences: await db.sequences.count(),
    pictographs: await db.pictographs.count(),
    userWork: await db.userWork.count(),
    userProjects: await db.userProjects.count(),
    settings: await db.settings.count(),
    // Train module stats (v4)
    trainPerformances: await db.trainPerformances.count(),
    trainCalibrationProfiles: await db.trainCalibrationProfiles.count(),
    // Compose module stats (v5)
    compositions: await db.compositions.count(),
    // Offline cache stats (v6)
    galleryCache: await db.galleryCache.count(),
    galleryCacheMeta: await db.galleryCacheMeta.count(),
    // Mandala loader pool (v8)
    generatedMandalaPool: await db.generatedMandalaPool.count(),
    mediaCompositionPresets: await db.mediaCompositionPresets.count(),
    messageDrafts: await db.messageDrafts.count(),
    messageOutbox: await db.messageOutbox.count(),
  };
  return info;
}
