/**
 * Tag Migration Service
 *
 * Migrates legacy tag formats to the new SequenceTag model:
 * - tags: string[] → sequenceTags: SequenceTag[] (via TagManager)
 * - tagIds: string[] → sequenceTags: SequenceTag[]
 *
 * Handles:
 * - Deduplication (case-insensitive)
 * - Tag document creation
 * - Source tracking (all migrated tags marked as "user")
 * - Backward compatibility (keeps both old and new fields during transition)
 */

import { createUserTag } from "../tag-manager";
import type { SequenceTag } from "#lib/shared/library/domain/models/sequence-tag.js";
import { createSequenceTag } from "#lib/shared/library/domain/models/sequence-tag.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/**
 * Migration result
 */
export interface TagMigrationResult {
  /** New structured tags */
  readonly sequenceTags: SequenceTag[];
  /** Tag IDs for backward compatibility */
  readonly tagIds: string[];
  /** Whether migration was performed */
  readonly migrated: boolean;
}

/**
 * Migrate tags from legacy formats to SequenceTag[]
 *
 * Priority:
 * 1. If sequenceTags already exists, use it (already migrated)
 * 2. If tagIds exists, convert to sequenceTags
 * 3. If tags (string[]) exists in SequenceData, create tag documents and convert
 * 4. Otherwise, return empty array
 *
 * @param sequence The sequence to migrate
 * @returns Migration result with sequenceTags and tagIds
 */
export async function migrateSequenceTags(
  sequence: LibrarySequence | (SequenceData & Partial<LibrarySequence>)
): Promise<TagMigrationResult> {
  // Case 1: Already migrated (has sequenceTags)
  if (
    "sequenceTags" in sequence &&
    sequence.sequenceTags &&
    sequence.sequenceTags.length > 0
  ) {
    const sequenceTags = [...sequence.sequenceTags];
    return {
      sequenceTags,
      tagIds: sequenceTags.map((st) => st.tagId),
      migrated: false,
    };
  }

  // Case 2: Has tagIds (already have tag documents, just need to wrap in SequenceTag)
  if ("tagIds" in sequence && sequence.tagIds && sequence.tagIds.length > 0) {
    const sequenceTags = sequence.tagIds.map((tagId) =>
      createSequenceTag(tagId, "user")
    );
    return {
      sequenceTags,
      tagIds: sequence.tagIds as string[],
      migrated: true,
    };
  }

  // Case 3: Has legacy tags (string[]) - create tag documents
  if ("tags" in sequence && sequence.tags && sequence.tags.length > 0) {
    const sequenceTags: SequenceTag[] = [];
    const tagIds: string[] = [];

    for (const tagName of sequence.tags) {
      if (!tagName || tagName.trim() === "") continue;

      try {
        // Create tag (or get existing if duplicate)
        const libraryTag = await createUserTag(tagName);
        sequenceTags.push(createSequenceTag(libraryTag.id, "user"));
        tagIds.push(libraryTag.id);
      } catch (error) {
        console.error(`Failed to migrate tag "${tagName}":`, error);
        // Continue with other tags
      }
    }

    return {
      sequenceTags,
      tagIds,
      migrated: true,
    };
  }

  // Case 4: No tags
  return {
    sequenceTags: [],
    tagIds: [],
    migrated: false,
  };
}

/**
 * Batch migrate multiple sequences
 * Useful for migrating a user's entire library
 *
 * @param sequences Sequences to migrate
 * @param onProgress Optional progress callback
 * @returns Array of migration results
 */
export async function batchMigrateSequenceTags(
  sequences: (LibrarySequence | (SequenceData & Partial<LibrarySequence>))[],
  onProgress?: (completed: number, total: number) => void
): Promise<TagMigrationResult[]> {
  const results: TagMigrationResult[] = [];

  for (let i = 0; i < sequences.length; i++) {
    const sequence = sequences[i];
    if (!sequence) {
      if (onProgress) {
        onProgress(i + 1, sequences.length);
      }
      continue;
    }
    const result = await migrateSequenceTags(sequence);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, sequences.length);
    }
  }

  return results;
}

/**
 * Check if a sequence needs migration
 */
export function needsMigration(
  sequence: LibrarySequence | (SequenceData & Partial<LibrarySequence>)
): boolean {
  // Already has sequenceTags
  if (
    "sequenceTags" in sequence &&
    sequence.sequenceTags &&
    sequence.sequenceTags.length > 0
  ) {
    return false;
  }

  // Has legacy data to migrate
  const hasTagIds =
    "tagIds" in sequence && sequence.tagIds && sequence.tagIds.length > 0;
  const hasTags =
    "tags" in sequence && sequence.tags && sequence.tags.length > 0;

  return hasTagIds || hasTags;
}
