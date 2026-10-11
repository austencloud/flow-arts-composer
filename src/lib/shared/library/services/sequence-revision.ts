import {
  createArtifactRevisionRef,
  type ArtifactRevisionRef,
} from "#lib/shared/artifact-revisions/domain/artifact-revision.js";
import { canonicalDigest } from "#lib/shared/foundation/utils/canonical-digest.js";
import type { PublicSequenceProjectionWrite } from "./public-sequence-projection";

const REVISION_PAYLOAD_EXCLUDED_KEYS = new Set([
  "forkCount",
  "viewCount",
  "starCount",
  "publicPerformanceCount",
  "latestPublicPerformanceAt",
  "birthday",
  "publishedAt",
  "updatedAt",
  "publicProjectionRevision",
  "publicProjectionDigest",
]);

export interface SequenceRevisionRecord extends ArtifactRevisionRef {
  readonly subjectType: "sequence";
  readonly sequenceId: string;
  readonly ownerId: string;
  readonly contentHash: string;
  readonly contentHashVersion: number;
  readonly projectionSchemaVersion: number;
  readonly publicationState: "public";
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: unknown;
}

export async function createSequenceRevisionRef(
  sequenceId: string,
  contentHash: string,
  contentHashVersion: number
): Promise<ArtifactRevisionRef> {
  const contentDigest = await canonicalDigest({
    subjectType: "sequence",
    sequenceId,
    contentHashVersion,
    contentHash,
  });
  return createArtifactRevisionRef(sequenceId, contentDigest);
}

/**
 * Retain the exact self-contained public payload while reusing the public
 * projection's already-governed digest policy. Engagement and lifecycle fields
 * are omitted because they are not part of the performed movement.
 */
export async function buildSequenceRevisionRecord(
  projection: PublicSequenceProjectionWrite,
  createdAt: unknown
): Promise<SequenceRevisionRecord> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(projection)) {
    if (!REVISION_PAYLOAD_EXCLUDED_KEYS.has(key) && value !== undefined) {
      payload[key] = value;
    }
  }
  // The public projection digest also covers mutable discovery presentation
  // such as thumbnails and profile attribution. A performed subject revision
  // is movement identity: stable sequence id + the canonical V2 motion hash.
  const ref = await createSequenceRevisionRef(
    projection.id,
    projection.contentHash,
    projection.contentHashVersion
  );
  return {
    ...ref,
    subjectType: "sequence",
    sequenceId: projection.id,
    ownerId: projection.ownerId,
    contentHash: projection.contentHash,
    contentHashVersion: projection.contentHashVersion,
    projectionSchemaVersion: projection.publicProjectionSchemaVersion,
    publicationState: "public",
    payload,
    createdAt,
  };
}
