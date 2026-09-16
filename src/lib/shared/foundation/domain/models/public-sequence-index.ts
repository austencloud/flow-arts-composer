/**
 * PublicSequenceIndex - Self-contained public sequence document
 *
 * Each published sequence is a complete, immutable snapshot. It contains
 * everything needed to render the sequence without fetching from any other
 * collection. The sourceRef is provenance metadata ("who published this"),
 * not a data dependency.
 *
 * Stored at: publicSequences/{sequenceId}
 *
 * Sync Strategy:
 * - Created when a sequence's visibility is set to "public"
 * - Deleted when visibility changes away from "public"
 * - Updated when relevant sequence fields change
 * - Deduplicated by contentHash at publish time
 */

import type { SoloPropData } from "$lib/shared/foundation/domain/models/solo-prop-data";
import type { StepPairingData } from "$lib/shared/foundation/domain/models/step-pairing-data";
import type { CreatorIntent } from "$lib/shared/foundation/domain/models/creator-intent";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

/**
 * PublicSequenceIndex - Self-contained public sequence for Browse
 */
export interface PublicSequenceIndex {
  /** Sequence ID (same as document ID and source sequence ID) */
  readonly id: string;

  /** Reference path to source: users/{ownerId}/sequences/{id} */
  readonly sourceRef: string;

  // OWNER INFO (denormalized)

  /** Owner user ID */
  readonly ownerId: string;

  /** Owner display name (denormalized from user profile) */
  readonly ownerDisplayName: string;

  /** Owner avatar URL (denormalized from user profile) */
  readonly ownerAvatarUrl?: string;


  /** Sequence name */
  readonly name: string;

  /** Word/phrase the sequence represents */
  readonly word: string;

  /** Thumbnail URLs (first 1-3 for preview) */
  readonly thumbnails: readonly string[];

  /** Total beat count */
  readonly sequenceLength?: number;

  /** Difficulty level (e.g., "beginner", "intermediate", "advanced") */
  readonly difficultyLevel?: string;

  /** Numeric difficulty level (1-5). Preferred over difficultyLevel string. */
  readonly level?: number;

  /** Grid used by the sequence's placements. */
  readonly gridMode?: GridMode;

  /** LOOP type label (e.g., "rotated", "mirrored+swapped", "freeform", null for non-LOOP) */
  readonly loopType?: string | null;

  /** LOOP period: 2 = halved (180°), 4 = quartered (90°). Only set for rotated LOOPs. */
  readonly period?: number;


  /** Number of times this has been forked */
  readonly forkCount: number;

  /** Number of times this has been viewed */
  readonly viewCount: number;

  /** Number of users who starred/liked this */
  readonly starCount: number;

  /** Public videos linked to this sequence. Never includes restricted videos. */
  readonly publicPerformanceCount: number;

  /** Creation time of the newest public performance, when one exists. */
  readonly latestPublicPerformanceAt?: Date;


  /** Denormalized tag names (not IDs) for filtering */
  readonly tags: readonly string[];


  /** Whether this is a forked sequence */
  readonly isForked: boolean;

  /** Original creator ID (if forked) */
  readonly originalCreatorId?: string;

  /** Original creator name (if forked) */
  readonly originalCreatorName?: string;

  // COMPOSITIONAL DATA (self-contained rendering)

  /** Full motion content hash (SHA-256) for deduplication */
  readonly contentHash?: string;

  /** SHA-256 of SequenceEncoder.encode() output - used for URL-to-library matching */
  readonly encoderHash?: string;

  /** Left-hand solo prop decomposition (steps + hand path) */
  readonly leftSoloProp?: SoloPropData;

  /** Right-hand solo prop decomposition (steps + hand path) */
  readonly rightSoloProp?: SoloPropData;

  /** Per-beat pairings linking left- and right-hand motions */
  readonly stepPairings?: readonly StepPairingData[];

  /** Hash of the left-hand dual-prop path */
  readonly leftPathHash?: string;

  /** Hash of the right-hand dual-prop path */
  readonly rightPathHash?: string;

  /** Hash of the left-hand solo prop */
  readonly leftSoloHash?: string;

  /** Hash of the right-hand solo prop */
  readonly rightSoloHash?: string;


  /** Creator's presentation intent (prop config + effort timeline) */
  readonly creatorIntent?: CreatorIntent | null;


  /** Original creation date (backfilled from source library doc) */
  readonly birthday?: Date;

  /** When published to public feed */
  readonly publishedAt: Date;

  /** When last updated */
  readonly updatedAt: Date;
}

/**
 * Create a public sequence index from a LibrarySequence
 */
export function createPublicSequenceIndex(
  sequence: {
    id: string;
    ownerId: string;
    name: string;
    word: string;
    thumbnails: readonly string[];
    sequenceLength?: number;
    difficultyLevel?: string;
    forkCount: number;
    viewCount: number;
    starCount: number;
    source: string;
    forkAttribution?: {
      originalCreatorId: string;
      originalCreatorName: string;
    };
    creatorIntent?: CreatorIntent | null;
  },
  owner: {
    displayName: string;
    avatarUrl?: string;
  },
  tagNames: readonly string[]
): PublicSequenceIndex {
  const now = new Date();

  return {
    id: sequence.id,
    sourceRef: `users/${sequence.ownerId}/sequences/${sequence.id}`,
    ownerId: sequence.ownerId,
    ownerDisplayName: owner.displayName,
    ownerAvatarUrl: owner.avatarUrl,
    name: sequence.name,
    word: sequence.word,
    thumbnails: sequence.thumbnails.slice(0, 3),
    sequenceLength: sequence.sequenceLength,
    difficultyLevel: sequence.difficultyLevel,
    forkCount: sequence.forkCount,
    viewCount: sequence.viewCount,
    starCount: sequence.starCount,
    publicPerformanceCount: 0,
    tags: tagNames,
    isForked: sequence.source === "forked",
    originalCreatorId: sequence.forkAttribution?.originalCreatorId,
    originalCreatorName: sequence.forkAttribution?.originalCreatorName,
    ...(sequence.creatorIntent && { creatorIntent: sequence.creatorIntent }),
    publishedAt: now,
    updatedAt: now,
  };
}
