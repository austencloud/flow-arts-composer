import { canonicalDigest } from "#lib/shared/foundation/utils/canonical-digest.js";
import {
  ARTIFACT_REVISION_DIGEST_ALGORITHM,
  ARTIFACT_REVISION_DIGEST_VERSION,
  createArtifactRevisionRef,
  type ArtifactRevisionRef,
} from "#lib/shared/artifact-revisions/domain/artifact-revision.js";
import type { CollectedTunnel } from "./tunnel-collection-types";

/** The exact tunnel state that a realization can truthfully depict. */
export interface TunnelRevisionPayload {
  readonly schemaVersion: 1 | 2;
  readonly steps: CollectedTunnel["steps"];
  readonly conjoined?: CollectedTunnel["conjoined"];
  readonly snapshot: CollectedTunnel["snapshot"];
  /** V1 retained a thumbnail in the immutable payload. V2 deliberately leaves
   * disposable renderer output on the mutable work document. */
  readonly poster?: string;
  readonly source?: CollectedTunnel["source"];
  readonly sourceWord?: string;
  readonly sourceSequenceId?: string;
  readonly composition?: CollectedTunnel["composition"];
}

export interface TunnelRevisionRecord extends ArtifactRevisionRef {
  readonly artifactType: "tunnel";
  readonly payload: TunnelRevisionPayload;
  readonly createdAt: number;
}

export function tunnelRevisionPayload(
  tunnel: Pick<
    CollectedTunnel,
    | "steps"
    | "conjoined"
    | "snapshot"
    | "poster"
    | "source"
    | "sourceWord"
    | "sourceSequenceId"
    | "composition"
    | "currentRevisionSchemaVersion"
  >,
  schemaVersion: 1 | 2 = tunnel.currentRevisionSchemaVersion ?? 2
): TunnelRevisionPayload {
  return {
    schemaVersion,
    steps: tunnel.steps,
    ...(tunnel.conjoined !== undefined && { conjoined: tunnel.conjoined }),
    snapshot: tunnel.snapshot,
    ...(schemaVersion === 1 ? { poster: tunnel.poster } : {}),
    ...(tunnel.source !== undefined && { source: tunnel.source }),
    ...(tunnel.sourceWord !== undefined && { sourceWord: tunnel.sourceWord }),
    ...(tunnel.sourceSequenceId !== undefined && {
      sourceSequenceId: tunnel.sourceSequenceId,
    }),
    ...(tunnel.composition !== undefined && {
      composition: tunnel.composition,
    }),
  };
}

export async function createTunnelRevision(
  tunnel: CollectedTunnel,
  createdAt: number
): Promise<TunnelRevisionRecord> {
  const payload = tunnelRevisionPayload(
    tunnel,
    tunnel.currentRevisionSchemaVersion ?? 2
  );
  const contentDigest = await canonicalDigest(payload);
  return {
    ...createArtifactRevisionRef(tunnel.id, contentDigest),
    artifactType: "tunnel",
    payload,
    createdAt,
  };
}

export async function prepareTunnelRevision(
  tunnel: CollectedTunnel,
  previous?: CollectedTunnel
): Promise<CollectedTunnel> {
  // An existing v1 revision remains exactly what it was. Compare its old
  // payload before moving to v2 so refreshing a poster or baselining envelope
  // metadata cannot silently rewrite history.
  const previousSchemaVersion = previous?.currentRevisionSchemaVersion ?? 1;
  if (previous?.currentRevisionId && previous.currentContentDigest) {
    const previousDigest = await canonicalDigest(
      tunnelRevisionPayload(tunnel, previousSchemaVersion)
    );
    if (previous.currentContentDigest === previousDigest) {
      return {
        ...tunnel,
        currentRevisionId: previous.currentRevisionId,
        currentContentDigest: previous.currentContentDigest,
        currentRevisionCreatedAt:
          previous.currentRevisionCreatedAt ?? previous.createdAt,
        revisionDigestAlgorithm: ARTIFACT_REVISION_DIGEST_ALGORITHM,
        revisionDigestVersion: ARTIFACT_REVISION_DIGEST_VERSION,
        currentRevisionSchemaVersion: previousSchemaVersion,
      };
    }
  }

  const schemaVersion = 2;
  const contentDigest = await canonicalDigest(
    tunnelRevisionPayload(tunnel, schemaVersion)
  );

  const ref = createArtifactRevisionRef(tunnel.id, contentDigest);
  return {
    ...tunnel,
    currentRevisionId: ref.revisionId,
    currentContentDigest: ref.contentDigest,
    currentRevisionCreatedAt: previous ? Date.now() : tunnel.createdAt,
    revisionDigestAlgorithm: ref.digestAlgorithm,
    revisionDigestVersion: ref.digestVersion,
    currentRevisionSchemaVersion: schemaVersion,
  };
}

export function currentTunnelRevisionRef(
  tunnel: CollectedTunnel
): ArtifactRevisionRef | null {
  if (!tunnel.currentRevisionId || !tunnel.currentContentDigest) return null;
  return {
    artifactId: tunnel.id,
    revisionId: tunnel.currentRevisionId,
    contentDigest: tunnel.currentContentDigest,
    digestAlgorithm:
      tunnel.revisionDigestAlgorithm ?? ARTIFACT_REVISION_DIGEST_ALGORITHM,
    digestVersion:
      tunnel.revisionDigestVersion ?? ARTIFACT_REVISION_DIGEST_VERSION,
  };
}
