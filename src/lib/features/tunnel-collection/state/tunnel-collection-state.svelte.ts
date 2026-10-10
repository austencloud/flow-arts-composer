import { CollectionState } from "#lib/shared/collections/collection-state.svelte.js";
import { LocalCollectionRepository } from "#lib/shared/collections/local-collection-repository.js";
import {
  TUNNEL_COLLECTION_STORAGE_KEY,
  TUNNEL_COLLECTION_SCHEMA_VERSION,
} from "../domain/tunnel-collection-types";
import type { CollectedTunnel } from "../domain/tunnel-collection-types";
import { prepareTunnelRevision } from "../domain/tunnel-revision";
import { migrateTunnelArtifact } from "../domain/tunnel-artifact-migration";
import { createTunnelCollectionRepository } from "../services/tunnel-collection-repository";

export const tunnelCollectionState = new CollectionState<CollectedTunnel>(
  createTunnelCollectionRepository(),
  new LocalCollectionRepository(
    TUNNEL_COLLECTION_STORAGE_KEY,
    TUNNEL_COLLECTION_SCHEMA_VERSION
  ),
  {
    prepareAdd: (entry) => prepareTunnelRevision(migrateTunnelArtifact(entry).tunnel),
    prepareUpdate: (previous, next) =>
      prepareTunnelRevision(migrateTunnelArtifact(next).tunnel, previous),
  }
);
