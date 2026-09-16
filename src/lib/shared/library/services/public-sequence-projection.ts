/**
 * The sole builder for a `publicSequences/{id}` document. It projects an
 * already-normalized sequence and settled context into a deterministic plain
 * object; Firestore and transaction ownership stay with the caller.
 *
 * The write shape is pinned by `public-sequence-projection.test.ts` and the
 * reader contract in `public-sequence-wire-schema.ts`. Callers must not build
 * public document maps independently.
 */

import type { FieldValue, Timestamp } from "firebase/firestore";

import { canonicalDigest } from "$lib/shared/foundation/utils/canonical-digest";
import { getUserSequencePath } from "$lib/shared/library/data/firestore-paths";
import { PUBLIC_PROJECTION_SCHEMA_VERSION } from "$lib/shared/foundation/domain/models/public-sequence-wire-schema";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { LibrarySequence } from "$lib/shared/library/domain/models/library-sequence";
import type { NormalizedSequenceWrite } from "$lib/shared/library/services/sequence-persistence-normalizer";

/**
 * Re-export the reader-owned version so public writers and readers cannot
 * declare parallel wire contracts.
 */
export { PUBLIC_PROJECTION_SCHEMA_VERSION };

export const PUBLIC_THUMBNAIL_LIMIT = 3;

/**
 * Counters, timestamps, and writer metadata do not represent projected content.
 * Composition objects are also excluded because normalization regenerates
 * their ids; their stable content hashes remain covered instead.
 */
export const PROJECTION_DIGEST_EXCLUDED_KEYS = [
  "forkCount",
  "viewCount",
  "starCount",
  "publicPerformanceCount",
  "latestPublicPerformanceAt",
  "publishedAt",
  "updatedAt",
  "birthday",
  "publicProjectionRevision",
  "publicProjectionDigest",
  "leftSoloProp",
  "rightSoloProp",
  "stepPairings",
] as const;

/**
 * Recomputes a stored schema-2 digest for narrow field patches and parity
 * audits. Legacy documents have different key sets, so callers must verify the
 * schema version first.
 */
export async function computeStoredProjectionDigest(
  document: Record<string, unknown>
): Promise<string> {
  const excluded = new Set<string>(PROJECTION_DIGEST_EXCLUDED_KEYS);
  const digestable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(document)) {
    if (!excluded.has(key) && value !== undefined) {
      digestable[key] = value;
    }
  }
  return canonicalDigest(digestable);
}

/**
 * Accepts both repository sentinels and concrete migration timestamps without
 * introducing a runtime Firebase dependency.
 */
export type PublicProjectionTimestamp = Date | Timestamp | FieldValue;

/** Accepts repository writes and normalized raw documents from migration tools. */
export type ProjectionSourceSequence = SequenceData &
  Partial<
    Pick<
      LibrarySequence,
      "source" | "forkAttribution" | "forkCount" | "viewCount" | "starCount"
    >
  >;

/** LOOP data, already detected. The builder does not detect anything itself. */
export interface PublicProjectionLoopData {
  readonly isCircular: boolean;
  readonly loopType: string | null;
  readonly period?: number;
  readonly components?: SequenceData["components"];
  readonly componentDomains?: SequenceData["componentDomains"];
  readonly loopSpec?: SequenceData["loopSpec"];
}

/**
 * External inputs must be settled before projection. An empty `tagNames` means
 * untagged; callers must abort on a failed lookup instead of passing one here.
 */
export interface PublicProjectionContext {
  /**
   * The authenticated publisher. Never infer this from the sequence because a
   * fork can retain its original creator's id.
   */
  readonly ownerId: string;
  readonly ownerDisplayName: string;
  readonly ownerAvatarUrl?: string;
  /** Resolved tag NAMES, not ids. Empty means untagged, never "lookup failed". */
  readonly tagNames: readonly string[];
  /** SHA-256 of the encoder output, for URL-to-library matching. */
  readonly encoderHash: string;
  readonly loop: PublicProjectionLoopData;
  readonly difficultyLevel?: string;
  readonly level?: number;
  /** The writer's timestamp sentinel, or a concrete date during migration. */
  readonly now: PublicProjectionTimestamp;
}

/**
 * Public-owned fields that projection refreshes must preserve. The explicit
 * prior-state discriminant prevents a failed read from posing as a first write.
 */
export interface ExistingPublicOwnedFields {
  /**
   * Set once and preserved. Concrete dates allow migration tools to recover a
   * lost publication time from owner data.
   */
  readonly publishedAt?: PublicProjectionTimestamp;
  readonly forkCount?: number;
  readonly viewCount?: number;
  readonly starCount?: number;
  readonly publicPerformanceCount?: number;
  readonly latestPublicPerformanceAt?: PublicProjectionTimestamp;
  /** A matching digest preserves the writer stamps, making refreshes idempotent. */
  readonly updatedAt?: PublicProjectionTimestamp;
  readonly publicProjectionRevision?: number;
  readonly publicProjectionDigest?: string;
}

/**
 * Complete, self-contained public write shape. It stays separate from the
 * reader model because writes may contain timestamp sentinels, while reads
 * expose converted dates.
 */
export interface PublicSequenceProjectionWrite {
  readonly sequenceKind?: SequenceData["sequenceKind"];
  readonly id: string;
  readonly sourceRef: string;
  readonly ownerId: string;

  readonly ownerDisplayName: string;
  readonly ownerAvatarUrl?: string;

  readonly name: string;
  readonly displayName?: string;
  readonly intendedWord?: string;
  readonly word: string;
  readonly thumbnails: readonly string[];

  readonly sequenceLength: number;
  readonly difficultyLevel?: string;
  readonly level?: number;

  readonly gridMode?: SequenceData["gridMode"];
  readonly reversalPattern?: string;

  readonly isCircular: boolean;
  readonly loopType: string | null;
  readonly period?: number;
  readonly components?: SequenceData["components"];
  readonly componentDomains?: SequenceData["componentDomains"];
  readonly loopSpec?: SequenceData["loopSpec"];

  readonly tags: readonly string[];

  readonly isForked: boolean;
  readonly originalCreatorId?: string;
  readonly originalCreatorName?: string;

  readonly contentHash: string;
  readonly contentHashVersion: number;
  readonly encoderHash: string;

  readonly leftSoloProp?: SequenceData["leftSoloProp"];
  readonly rightSoloProp?: SequenceData["rightSoloProp"];
  readonly stepPairings?: SequenceData["stepPairings"];
  readonly leftPathHash?: string;
  readonly rightPathHash?: string;
  readonly leftSoloHash?: string;
  readonly rightSoloHash?: string;
  readonly startPlacement?: SequenceData["startPlacement"];

  readonly creatorIntent?: NonNullable<SequenceData["creatorIntent"]>;

  readonly animatedSequenceUrl?: string;
  readonly animationFormat?: SequenceData["animationFormat"];

  readonly forkCount: number;
  readonly viewCount: number;
  readonly starCount: number;
  readonly publicPerformanceCount: number;
  readonly latestPublicPerformanceAt?: PublicProjectionTimestamp;

  readonly birthday?: PublicProjectionTimestamp;
  /** Publication lifecycle (PUB). Set once, preserved on every resync. */
  readonly publishedAt: PublicProjectionTimestamp;

  readonly updatedAt: PublicProjectionTimestamp;
  readonly publicProjectionRevision: number;
  readonly publicProjectionSchemaVersion: number;
  readonly publicProjectionDigest: string;
}

export type PublicSequenceIndexWriteData = PublicSequenceProjectionWrite;

type DigestedProjection = Omit<
  PublicSequenceProjectionWrite,
  (typeof PROJECTION_DIGEST_EXCLUDED_KEYS)[number]
>;

/**
 * Requires callers to distinguish a verified missing document from an existing
 * one. A failed read has no representation because treating it as a first
 * publication would reset counters and publication time.
 */
export type PublicProjectionPriorState =
  | { readonly kind: "first-publication" }
  | { readonly kind: "existing"; readonly fields: ExistingPublicOwnedFields };

/**
 * Deterministically rebuilds source and profile fields while preserving public
 * counters and publication time. Writer stamps advance only when the digest
 * changes. Conditional spreads keep `undefined` out of Firestore and ensure the
 * digest survives a storage round trip.
 */
export async function buildPublicSequenceProjection(
  normalized: NormalizedSequenceWrite<ProjectionSourceSequence>,
  context: PublicProjectionContext,
  revision: number,
  prior: PublicProjectionPriorState
): Promise<PublicSequenceProjectionWrite> {
  const source = normalized.ownerData;
  const { loop } = context;
  const existing = prior.kind === "existing" ? prior.fields : undefined;

  // Building the digest source as the document shape makes new fields covered
  // unless they are explicitly excluded.
  const digested: DigestedProjection = {
    id: source.id,
    sourceRef: getUserSequencePath(context.ownerId, source.id),
    ownerId: context.ownerId,

    ownerDisplayName: context.ownerDisplayName,
    ...(context.ownerAvatarUrl !== undefined && {
      ownerAvatarUrl: context.ownerAvatarUrl,
    }),

    name: source.name,
    ...(source.sequenceKind !== undefined && {
      sequenceKind: source.sequenceKind,
    }),
    ...(source.displayName !== undefined && {
      displayName: source.displayName,
    }),
    ...(source.intendedWord !== undefined && {
      intendedWord: source.intendedWord,
    }),
    // The exact word from strict derivation. NOT `source.word`, and never a
    // name or auto-title — `library-repository.ts:708`'s
    // `word: sequence.word || metadata.name` is how "Assemble Sequence" became
    // a stored word.
    word: normalized.exactWord,
    thumbnails: (source.thumbnails ?? []).slice(0, PUBLIC_THUMBNAIL_LIMIT),

    // The normalizer owns the canonical count; optional steps are not a fallback.
    sequenceLength: normalized.sequenceLength,
    ...(context.difficultyLevel !== undefined && {
      difficultyLevel: context.difficultyLevel,
    }),
    ...(context.level !== undefined && { level: context.level }),

    ...(source.gridMode !== undefined && { gridMode: source.gridMode }),
    ...(source.reversalPattern !== undefined && {
      reversalPattern: source.reversalPattern,
    }),

    isCircular: loop.isCircular,
    loopType: loop.loopType,
    ...(loop.period !== undefined && { period: loop.period }),
    ...(loop.components !== undefined && { components: loop.components }),
    ...(loop.componentDomains !== undefined && {
      componentDomains: loop.componentDomains,
    }),
    ...(loop.loopSpec !== undefined && { loopSpec: loop.loopSpec }),

    tags: context.tagNames,

    isForked: source.source === "forked",
    ...(source.forkAttribution?.originalCreatorId !== undefined && {
      originalCreatorId: source.forkAttribution.originalCreatorId,
    }),
    ...(source.forkAttribution?.originalCreatorName !== undefined && {
      originalCreatorName: source.forkAttribution.originalCreatorName,
    }),

    contentHash: normalized.contentHash,
    contentHashVersion: normalized.contentHashVersion,
    encoderHash: context.encoderHash,

    // Regenerated composition members are added after digesting.
    ...(source.leftPathHash !== undefined && {
      leftPathHash: source.leftPathHash,
    }),
    ...(source.rightPathHash !== undefined && {
      rightPathHash: source.rightPathHash,
    }),
    ...(source.leftSoloHash !== undefined && {
      leftSoloHash: source.leftSoloHash,
    }),
    ...(source.rightSoloHash !== undefined && {
      rightSoloHash: source.rightSoloHash,
    }),
    ...(source.startPlacement !== undefined && {
      startPlacement: source.startPlacement,
    }),

    // `null` is the legacy "none recorded" value and is not persisted.
    ...(source.creatorIntent != null && {
      creatorIntent: source.creatorIntent,
    }),

    ...(source.animatedSequenceUrl !== undefined && {
      animatedSequenceUrl: source.animatedSequenceUrl,
    }),
    ...(source.animationFormat !== undefined && {
      animationFormat: source.animationFormat,
    }),

    publicProjectionSchemaVersion: PUBLIC_PROJECTION_SCHEMA_VERSION,
  };

  const publicProjectionDigest = await canonicalDigest(digested);

  // Writer stamps stay stable for changes outside the public projection.
  const contentUnchanged =
    existing?.publicProjectionDigest !== undefined &&
    existing.publicProjectionDigest === publicProjectionDigest;

  return {
    ...digested,

    // Stored for hydration, but excluded because normalization regenerates ids.
    ...(source.leftSoloProp !== undefined && {
      leftSoloProp: source.leftSoloProp,
    }),
    ...(source.rightSoloProp !== undefined && {
      rightSoloProp: source.rightSoloProp,
    }),
    ...(source.stepPairings !== undefined && {
      stepPairings: source.stepPairings,
    }),

    // Existing public counters win; owner counts seed only the first publication.
    forkCount: existing?.forkCount ?? source.forkCount ?? 0,
    viewCount: existing?.viewCount ?? source.viewCount ?? 0,
    starCount: existing?.starCount ?? source.starCount ?? 0,
    publicPerformanceCount: existing?.publicPerformanceCount ?? 0,
    ...(existing?.latestPublicPerformanceAt !== undefined && {
      latestPublicPerformanceAt: existing.latestPublicPerformanceAt,
    }),

    // Preserve the creation date instead of the bulk-publication date.
    ...((source.birthday ?? source.createdAt) !== undefined && {
      birthday: source.birthday ?? source.createdAt,
    }),

    publishedAt: existing?.publishedAt ?? context.now,

    updatedAt:
      contentUnchanged && existing?.updatedAt !== undefined
        ? existing.updatedAt
        : context.now,
    publicProjectionRevision:
      contentUnchanged && existing?.publicProjectionRevision !== undefined
        ? existing.publicProjectionRevision
        : revision,
    publicProjectionDigest,
  };
}
