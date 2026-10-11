import { canonicalDigest } from "#lib/shared/foundation/utils/canonical-digest.js";
import {
  ARTIFACT_REVISION_DIGEST_ALGORITHM,
  ARTIFACT_REVISION_DIGEST_VERSION,
  createArtifactRevisionRef,
  type ArtifactRevisionRef,
} from "#lib/shared/artifact-revisions/domain/artifact-revision.js";
import type { CollectedMandala } from "./mandala-collection-types";

/**
 * The exact mandala state a rendering can truthfully depict. A mandala is
 * fully determined by its choreography plus how the two props are drawn, so
 * those are the digest-covered fields — the name and the lineage stamp are
 * labels around the work, not the work.
 */
export interface MandalaRevisionPayload {
  readonly steps: CollectedMandala["steps"];
  readonly variant: CollectedMandala["variant"];
  readonly leftPropType: string;
  readonly rightPropType: string;
  readonly pathShape?: CollectedMandala["pathShape"];
  readonly source?: CollectedMandala["source"];
  readonly sourceWord?: string;
  readonly sourceSequenceId?: string;
}

export interface MandalaRevisionRecord extends ArtifactRevisionRef {
  readonly artifactType: "mandala";
  readonly payload: MandalaRevisionPayload;
  readonly createdAt: number;
}

export function mandalaRevisionPayload(
  mandala: Pick<
    CollectedMandala,
    | "steps"
    | "variant"
    | "leftPropType"
    | "rightPropType"
    | "pathShape"
    | "source"
    | "sourceWord"
    | "sourceSequenceId"
  >
): MandalaRevisionPayload {
  return {
    steps: mandala.steps,
    variant: mandala.variant,
    leftPropType: mandala.leftPropType,
    rightPropType: mandala.rightPropType,
    ...(mandala.pathShape !== undefined && { pathShape: mandala.pathShape }),
    ...(mandala.source !== undefined && { source: mandala.source }),
    ...(mandala.sourceWord !== undefined && { sourceWord: mandala.sourceWord }),
    ...(mandala.sourceSequenceId !== undefined && {
      sourceSequenceId: mandala.sourceSequenceId,
    }),
  };
}

export async function createMandalaRevision(
  mandala: CollectedMandala,
  createdAt: number
): Promise<MandalaRevisionRecord> {
  const payload = mandalaRevisionPayload(mandala);
  const contentDigest = await canonicalDigest(payload);
  return {
    ...createArtifactRevisionRef(mandala.id, contentDigest),
    artifactType: "mandala",
    payload,
    createdAt,
  };
}

/** Stamp the revision metadata a save must carry. Unchanged content keeps its
 *  existing revision id, so re-saving a mandala is idempotent. */
export async function prepareMandalaRevision(
  mandala: CollectedMandala,
  previous?: CollectedMandala
): Promise<CollectedMandala> {
  const payload = mandalaRevisionPayload(mandala);
  const contentDigest = await canonicalDigest(payload);
  if (
    previous?.currentContentDigest === contentDigest &&
    previous.currentRevisionId
  ) {
    return {
      ...mandala,
      currentRevisionId: previous.currentRevisionId,
      currentContentDigest: previous.currentContentDigest,
      currentRevisionCreatedAt:
        previous.currentRevisionCreatedAt ?? previous.createdAt,
      revisionDigestAlgorithm: ARTIFACT_REVISION_DIGEST_ALGORITHM,
      revisionDigestVersion: ARTIFACT_REVISION_DIGEST_VERSION,
    };
  }

  const ref = createArtifactRevisionRef(mandala.id, contentDigest);
  return {
    ...mandala,
    currentRevisionId: ref.revisionId,
    currentContentDigest: ref.contentDigest,
    currentRevisionCreatedAt: previous ? Date.now() : mandala.createdAt,
    revisionDigestAlgorithm: ref.digestAlgorithm,
    revisionDigestVersion: ref.digestVersion,
  };
}

export function currentMandalaRevisionRef(
  mandala: CollectedMandala
): ArtifactRevisionRef | null {
  if (!mandala.currentRevisionId || !mandala.currentContentDigest) return null;
  return {
    artifactId: mandala.id,
    revisionId: mandala.currentRevisionId,
    contentDigest: mandala.currentContentDigest,
    digestAlgorithm:
      mandala.revisionDigestAlgorithm ?? ARTIFACT_REVISION_DIGEST_ALGORITHM,
    digestVersion:
      mandala.revisionDigestVersion ?? ARTIFACT_REVISION_DIGEST_VERSION,
  };
}
