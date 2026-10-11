import type { LibrarySequence } from "./domain/models/library-sequence";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequenceTag } from "./domain/models/sequence-tag";

export interface TagMigrationResult {
  readonly sequenceTags: SequenceTag[];
  readonly tagIds: string[];
  readonly migrated: boolean;
}

export type TagMigrator = (
  sequence: LibrarySequence | (SequenceData & Partial<LibrarySequence>)
) => Promise<TagMigrationResult>;

let tagMigrator: TagMigrator | null = null;

/**
 * Register the tag migration function.
 * Called once from the composition root (di/index.ts) at app startup
 * to avoid a reverse import (shared/ must not import from features/).
 */
export function registerTagMigrator(fn: TagMigrator): void {
  tagMigrator = fn;
}

/**
 * Get the registered tag migrator.
 * Throws if not yet registered (app startup ordering issue).
 */
export function getTagMigrator(): TagMigrator {
  if (!tagMigrator) {
    throw new Error(
      "TagMigrator not registered. " +
        "Ensure registerTagMigrator() is called at app startup."
    );
  }
  return tagMigrator;
}
