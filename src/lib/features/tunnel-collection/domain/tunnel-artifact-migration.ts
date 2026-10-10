import {
  SNAPSHOT_VERSION,
  migrateTunnelSnapshot,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-snapshot.js";
import {
  TUNNEL_ARTIFACT_SCHEMA_VERSION,
  type CollectedTunnel,
} from "./tunnel-collection-types";

export interface TunnelArtifactMigration {
  readonly tunnel: CollectedTunnel;
  readonly changed: boolean;
}

/**
 * Reads every known tunnel envelope without pretending a legacy record carried
 * facts it did not. A missing composition remains a one-source legacy record;
 * a missing poster marker remains unknown and is eligible for a safe refresh.
 */
export function migrateTunnelArtifact(
  tunnel: CollectedTunnel
): TunnelArtifactMigration {
  const snapshot = migrateTunnelSnapshot(tunnel.snapshot);
  const changed =
    tunnel.artifactSchemaVersion !== TUNNEL_ARTIFACT_SCHEMA_VERSION ||
    snapshot !== tunnel.snapshot;

  if (!changed) return { tunnel, changed: false };
  return {
    tunnel: {
      ...tunnel,
      artifactSchemaVersion: TUNNEL_ARTIFACT_SCHEMA_VERSION,
      snapshot,
    },
    changed: true,
  };
}

export function needsTunnelPosterRefresh(tunnel: CollectedTunnel): boolean {
  return tunnel.posterRenderVersion !== 1;
}
